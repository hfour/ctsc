# ctsc

Experimental caching TypeScript compiler suitable for monorepos

## install

Currently not available on npm, must install via git

    yarn add hfour/ctsc

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
1. When ctsc is used to build the package `B` for the first time, a `.ctsc.hash` file is inserted
into the output, containing the OHASH - a hash computed from all the outout .d.ts files produced by
the compilation.
2. If package `A`'s dependency is `B`, its OHASH `.ctsc.hash` file is included when calculating the
input hash IHASH hash of package `A`. In addition, all the sources specified in `include` are also
considered when calculating the IHASH.
3. If the input hash IHASH matches a directory in `$CTSC_CACHE_DIR` named `$IHASH`, `tsc` is not
invoked. Instead, the outDir is copied from the cache directly to the destination.
4. If a depedency has its types change, it will propagate arebuild to all its dependants. However,
if the dependants don't have a type change, rebuild propagation will stop at them.


