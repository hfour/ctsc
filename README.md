# ctsc

Experimental caching TypeScript compiler suitable for monorepos

## install

Currently not available on npm, must install via git

    yarn add hfour/ctsc

Requirements:

* (windows): WSL - windows subsystem for linux
* git (for `git hash-object`)

## usage

Within a package dir:

    ctsc [-p tsconfig.json]

The package must have at least the following configuration in tsconfig:

* include - must be an array of directories to include
* compilerOptions.outDir
* its dependencies must be referenced in package.json

Then you can use it with [wsrun](https://github.com/whoeverest/wsrun)

    yarn wsrun --staged -r ctsc

## how it works

1. When ctsc is used to build the package `A` for the first time, a `.ctsc.hash` file is inserted into the output, containing a hash computed from all the **input** files relevant to the compilation. The output directory `outDir` is additionally copied to `$CTSC_CACHE_DIR/$HASH`
2. If a package's dependency `B` has a `.ctsc.hash` file, its included when calculating the
hash of package `A`
3. Next time, if the combined hash of the inputs matches a directory in `CTSC_CACHE_DIR`, `tsc` is not invoked, instead, the outDir is copied from the cache directly to the destination.
4. If a depedency changes, it will propagate a hash change throughout all its dependants. Therefore `ctsc` is very conservative and will rebuild a large portion of the subtree if an often used dependency has changed.


