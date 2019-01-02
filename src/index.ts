#!/usr/bin/env node

let DEBUG = process.env['DEBUG'] || false;


if (DEBUG) {
  var rt = require('require-times')()
  rt.start()
}
import yargs from 'yargs';
import path from 'path';
import cp from 'child_process';
import * as tscfg from 'tsconfig';
import util from 'util';
import fs, { mkdir } from 'fs';
import rrelative from 'require-relative';
import mkdirp from 'mkdirp'
import os from 'os';

//import cpx from 'cpx';
if (DEBUG && rt) rt.end()

// let copyAsync = util.promisify(cpx.copy) as (src: string, dst: string, opts?: cpx.AsyncOptions) => Promise<void>;

let mkdirpAsync = util.promisify(mkdirp)

let copyAsync = async (src: string, dest: string, _opts?:any) => {
  if (DEBUG) console.log(`cp -Tr ${src} ${dest}`)
  await mkdirpAsync(dest)
  let copyProcess = await cp.spawnSync('bash', ['-c', `cp -Tr ${src} ${dest}`])
  if (copyProcess.status > 0) {
    console.error(copyProcess.stderr.toString());
    process.exit(1)
  }
}

let hashSync = (items: string[], criteria: string = '') => {
  let cmd = `find ${items.join(' ')} -type f ${criteria} | xargs tail -n +1 | git hash-object --stdin`;
  if (DEBUG) console.log(cmd);
  let hashRes = cp.spawnSync('bash', ['-c', cmd], { encoding: 'utf8' });
  if (hashRes.status > 0) {
    console.error(hashRes.stderr);
    process.exit(1)
  }
  let hash = hashRes.stdout.trim();
  return hash;
}

let readAsync = util.promisify(fs.readFile);
let existAsync = util.promisify(fs.exists);
let renameAsync = util.promisify(fs.rename);

let CTSC_TMP_DIR = process.env['CTSC_TMP_DIR'] || os.tmpdir() + '/ctsc';

let argv = yargs.options({
  p: {
    type: 'string'
  }
}).argv;

let HASH_FILE_NAME = '.ctsc.hash';

async function main() {
  if (DEBUG) console.time('initial discovery');
  let process_cwd = process.cwd();
  let tsConfig = null;
  try {
    tsConfig = await tscfg.load(process_cwd, argv.p);
  } catch (e) {}

  if (!tsConfig || !tsConfig.config) {
    console.error('No tsconfig.json found at', process_cwd, argv.p || '');
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
  if (DEBUG) console.timeEnd('initial discovery');

  if (DEBUG) console.time('tsconfigs resolve');
  let depsTsconfigs = deps.map(dep => {
    try {
      return { dep, dir: path.dirname(rrelative.resolve(dep + '/tsconfig.json', process_cwd)) };
    } catch (e) {
      return null;
    }
  });
  if (DEBUG) console.timeEnd('tsconfigs resolve');

  if (DEBUG) console.time('tsconfigs read');
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
  if (DEBUG) console.timeEnd('tsconfigs read');

  let allFiles: string[] = [];
  for (let dep of tsconfigs) {
    if (dep && dep.config && dep.config.compilerOptions && dep.config.compilerOptions.outDir) {
      let item = path.resolve(dep.dir, dep.config.compilerOptions.outDir, HASH_FILE_NAME);
      //if (!await existAsync(item)) continue;
      allFiles.push(path.relative(process_cwd, item));
    }
  }

  if (DEBUG) console.time('globs read');
  allFiles = allFiles.concat(includes).sort();
  if (DEBUG) console.timeEnd('globs read');

  if (DEBUG) console.time('hashing');
  let hash = hashSync(allFiles);
  let hashDir = path.resolve(CTSC_TMP_DIR, hash);
  let outDirFull = path.resolve(process_cwd, outDir);
  if (DEBUG) console.timeEnd('hashing');
  if (await existAsync(hashDir)) {
    if (DEBUG) console.time('copy from hashdir');
    await copyAsync(hashDir, outDirFull);
    if (DEBUG) console.timeEnd('copy from hashdir');

  } else {
    let tsConfig = argv.p || 'tsconfig.json';
    let out = cp.spawnSync('tsc', ['-p', tsConfig], { encoding: 'utf8' });
    if (out.stdout) console.log(out.stdout);
    if (out.stderr) console.error(out.stderr);
    if (out.status != 0) {
      process.exit(out.status);
    } else {
      let hashOut = hashSync([outDir], "-name '*.d.ts'");
      fs.writeFileSync(path.resolve(outDirFull, HASH_FILE_NAME), hashOut);
      let rnd = Math.random()
      await copyAsync(outDirFull, hashDir + rnd);

      // rename is atomic
      await renameAsync(hashDir + rnd, hashDir);
    }
  }
}

main();
