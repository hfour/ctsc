#!/usr/bin/env node

import yargs from 'yargs';
import path from 'path';
import cp from 'child_process';
import * as tscfg from 'tsconfig';
import util from 'util';
import fs from 'fs';
import rrelative from 'require-relative';
import mkdirp from 'mkdirp';
import os from 'os';

let mkdirpAsync = util.promisify(mkdirp);

let copyAsync = async (src: string, dest: string, _opts?: any) => {
  await mkdirpAsync(dest);
  let copyProcess = await cp.spawnSync('bash', ['-c', `cp -r ${src}/. ${dest}`]);
  if (copyProcess.status > 0) {
    console.error(copyProcess.stderr.toString());
    process.exit(1);
  }
};

let hashSync = (items: string[], criteria: string = '') => {
  let cmd = `find ${items.join(
    ' '
  )} -type f ${criteria} | xargs tail -n +1 | git hash-object --stdin`;
  let hashRes = cp.spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
  if (hashRes.status > 0) {
    throw new Error(hashRes.stderr);
  }
  let hash = hashRes.stdout.trim();
  return hash;
};

let readAsync = util.promisify(fs.readFile);
let readdirAsync = util.promisify(fs.readdir);
let existAsync = util.promisify(fs.exists);
let renameAsync = util.promisify(fs.rename);
let statAsync = util.promisify(fs.stat);
let utimesAsync = util.promisify(fs.utimes);
let rmdirAsync = (path: string) => {
  let rm = cp.spawnSync('bash', ['-c', `rm -r ${path}`]);
  if (rm.status > 0) {
    throw new Error(rm.stderr.toString());
  }
};

const HASH_FILE_NAME = '.ctsc.hash';

async function main() {
  let CTSC_TMP_DIR = process.env['CTSC_TMP_DIR'] || os.tmpdir() + '/ctsc';
  let CTSC_TMP_MAX_ITEMS = Number(process.env['CTSC_TMP_MAX_ITEMS'] || '300');
  let argv = yargs.options({
    p: {
      type: 'string'
    },
    clean: {
      type: 'boolean'
    }
  }).argv;

  if (argv.clean) await cleanup({ tmpdir: CTSC_TMP_DIR, maxItems: CTSC_TMP_MAX_ITEMS });
  else await compile({ tsconfig: argv.p, tmpdir: CTSC_TMP_DIR });
}

async function cleanup(opts: { tmpdir: string; maxItems: number }) {
  let hashList = await readdirAsync(opts.tmpdir);
  let dirList = await Promise.all(
    hashList.map(async hl => ({
      path: path.resolve(opts.tmpdir, hl),
      stat: await statAsync(path.resolve(opts.tmpdir, hl))
    }))
  );

  let cleanup = dirList.sort((i1, i2) => i2.stat.atimeMs - i1.stat.atimeMs).slice(opts.maxItems);

  console.log('Cleaning up', cleanup.length, 'cached items');
  for (let item of cleanup) {
    await rmdirAsync(item.path);
  }
}

async function compile(opts: { tsconfig: string | undefined; tmpdir: string }) {
  let process_cwd = process.cwd();
  let tsConfig = null;
  try {
    tsConfig = await tscfg.load(process_cwd, opts.tsconfig);
  } catch (e) {}

  if (!tsConfig || !tsConfig.config) {
    console.error('No tsconfig.json found at', process_cwd, opts.tsconfig || '');
    return process.exit(0);
  }

  let includes: string[] = tsConfig.config.include;
  if (!includes) {
    console.error('No include found in tsconfig', tsConfig.path);
    return process.exit(0);
  }

  let outDir = tsConfig.config.compilerOptions.outDir;
  if (!outDir) {
    console.error('No compilerOptions.outDir found in tsconfig', tsConfig.path);
    return process.exit(0);
  }

  let pkgJson = null;
  try {
    pkgJson = JSON.parse(await readAsync(path.resolve(process_cwd, 'package.json'), 'utf8'));
  } catch (e) {}

  if (!pkgJson) {
    console.error('package.json not found at', process_cwd);
    return process.exit(0);
  }
  let deps = Object.keys(pkgJson.dependencies || {}).concat(
    Object.keys(pkgJson.devDependencies || {})
  );

  let depsTsconfigs = deps.map(dep => {
    try {
      return { dep, dir: path.dirname(rrelative.resolve(dep + '/tsconfig.json', process_cwd)) };
    } catch (e) {
      return null;
    }
  });
  let tsconfigs = await Promise.all(
    depsTsconfigs.map(async tsc => {
      if (!tsc) return null;
      try {
        let loaded = await tscfg.load(tsc.dir, 'tsconfig.json');
        return Object.assign(tsc, { config: loaded.config });
      } catch (e) {
        return null;
      }
    })
  );
  let allFiles: string[] = [];
  for (let dep of tsconfigs) {
    if (dep && dep.config && dep.config.compilerOptions && dep.config.compilerOptions.outDir) {
      let item = path.resolve(dep.dir, dep.config.compilerOptions.outDir, HASH_FILE_NAME);
      if (!(await existAsync(item))) continue;
      allFiles.push(path.relative(process_cwd, item));
    }
  }

  allFiles = allFiles.concat(includes).sort();

  let hash = hashSync(allFiles);
  let hashDir = path.resolve(opts.tmpdir, hash);
  let outDirFull = path.resolve(process_cwd, outDir);
  if (await existAsync(hashDir)) {
    await copyAsync(hashDir, outDirFull);
    await utimesAsync(hashDir, Date.now(), Date.now());
  } else {
    let tsConfig = opts.tsconfig || 'tsconfig.json';
    let out = cp.spawnSync('tsc', ['-p', tsConfig], { encoding: 'utf8' });
    if (out.stdout) console.log(out.stdout);
    if (out.stderr) console.error(out.stderr);
    if (out.status != 0) {
      process.exit(out.status);
    } else {
      let hashOut = hashSync([outDir], "-name '*.d.ts'");
      fs.writeFileSync(path.resolve(outDirFull, HASH_FILE_NAME), hashOut);
      let rnd = Math.random();
      await copyAsync(outDirFull, hashDir + rnd);

      // rename is atomic
      await renameAsync(hashDir + rnd, hashDir);
    }
  }
}

main();
