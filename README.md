# ctsc

Experimental caching TypeScript compiler suitable for monorepos and CI

## install

Currently not available on npm, must clone via git

    git clone git@github.com:hfour/ctsc.git
    cd ctsc
    yarn tsc
    yarn link

Then in the folder where you use it

    yarn link ctsc

Requirements:

* (windows): WSL - windows subsystem for linux (find, xargs, tail)
* git (for `git hash-object`)

## usage

Within a package dir:

    ctsc [-p tsconfig.json]

The package must have at least the following configuration in tsconfig:

* include - must be an array of directories or files to include
* compilerOptions.outDir - must exist and be a target output directory

and its workspace dependencies must be referenced in package.json `dependencies` or
`devDependencies`

Then you can use it with [wsrun](https://github.com/whoeverest/wsrun)

    yarn wsrun --staged -r ctsc

## how it works

1. ctsc calculates two types of hash: input files hash IHASH, and output (type) hash, OHASH
2. When ctsc is used to build the package `B` for the first time, a `.ctsc.hash` file is inserted into the output, containing the `OHASH` - a hash computed from all the outout .d.ts files produced by the compilation.
3. If package `A`'s dependency is `B`, the OHASH of `B` from its `.ctsc.hash` file is included when calculating the input hash `IHASH` hash of package `A`. In addition, all the sources specified in `include` are also considered when calculating the IHASH.
4. If this input hash matches a directory in `$CTSC_CACHE_DIR` named `$IHASH`, `tsc` is not invoked. Instead, the outDir is copied from the cache directly to the destination.
5. With this scheme, if a depedency has a change in its type definitions, it will propagate a rebuild to all its dependants. If the package doesn't have a types change, a rebuild will not propagate.
6. If the dependants themselves end up with a type definition change, rebuild propagation will continue further.


