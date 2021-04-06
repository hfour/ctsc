# NOT MAINTAINED

This project is no longer maintained. Please use tsc project mode - it should now be mature enough to work well in most situations.

# ctsc

Experimental caching TypeScript compiler suitable for monorepos and CI.

This acts as a drop-in replacement for TypeScript's own `tsc`. It will store the compiled files in a cache directory at `$CTSC_CACHE_DIR` (default to `/tmp/ctsc`). The next time the compiler is invoked for a particular module, the cached output will be re-used if all the inputs are the same (checked with git hash-object, sha1).

#### how it differs from tsc project mode

With the introduction of project mode, local caching was added, however, it has 3 significant restrictions:

- it requires that all modules compile with declarations. This means that the toplevel application packages cannot easily be included in the project mode and have to be compiled separately.
- it requires you to specify the dependant projects, even though they can be read from `package.json`. This means double book-keeping.
- it only reuses files found in the local directory. This means it cannot be used to speed up compilation in CI by having a shared cache directory containing most of the unchanged modules, precompiled.

ctsc has a different set of limitations, which are somewhat less restrictive:

- it requires the `outDir` setting, so it can more easily cache the output directory properly. This
  limitation may be removable in the future if we decide to add a filter of the files to copy, as well
  as use a better copying solution such as `rsync` or `cpx` (slow)
- it requires the `include` setting, so it can more easily read all the inputs. This limitation may
  also be removable in the future if we decide to add a filter on the files to use when calculating
  the input hash.

Most monorepo projects already specify an `outDir` as `build` and `include` directories (e.g. src,
tests, etc) so we believe these limitations are ok. Let us know if you disagree.

## install

    yarn add ctsc

Requirements:

- (windows): WSL - windows subsystem for linux (find, xargs, tail)
- git (for `git hash-object`)

## usage

Within a package dir:

    ctsc [-p tsconfig.json]

The package must have at least the following configuration in tsconfig:

- include - must be an array of directories or files to include
- compilerOptions.outDir - must exist and be a target output directory

and its workspace dependencies must be referenced in package.json `dependencies` or
`devDependencies`

Then you can use it with [wsrun](https://github.com/hfour/wsrun)

    yarn wsrun --staged -r ctsc

To prune old items from the cache (use env var CTSC_TMP_MAX_ITEMS to limit the cache size)

    ctsc --clean

To purge the entire cache

    ctsc --purge

## how it works

1. ctsc calculates two types of hash: input files hash IHASH, and output (type) hash, OHASH
2. When ctsc is used to build the package `B` for the first time, a `.ctsc.hash` file is inserted into the output, containing the `OHASH` - a hash computed from all the outout .d.ts files produced by the compilation.
3. If package `A`'s dependency is `B`, the OHASH of `B` from its `.ctsc.hash` file is included when calculating the input hash `IHASH` hash of package `A`. In addition, all the sources specified in `include` are also considered when calculating the IHASH.
4. If this input hash matches a directory in `$CTSC_CACHE_DIR` named `$IHASH`, `tsc` is not invoked. Instead, the outDir is copied from the cache directly to the destination.
5. With this scheme, if a depedency has a change in its type definitions, it will propagate a rebuild to all its dependants. If the package doesn't have a types change, a rebuild will not propagate.
6. If the dependants themselves end up with a type definition change, rebuild propagation will continue further.

### does this mean it can work with dependencies in node_modules too?

Yes! If the dependency was compiled with ctsc, a `.ctsc.hash` will be included in the output directory. If this hash of the definition files has changed, any module that depends on that dependency will be rebuilt by ctsc when you install the new version via yarn/npm!
