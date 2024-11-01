# Docs for development on the sdk

## Commands

### Build

You can build the sdk with `build-embedding-sdk`.

### Watch

If you want to have it build when you change a file there are two options:

#### build-embedding-sdk:watch

`build-embedding-sdk:watch` is the original command, the js output is fast, but the dts output is extremely slow and is not fixed by the fixup script on watch.

#### embedding-sdk:dev

This is an _experimental_ command that should be much faster, it uses `tsc --incremental` to to generate the dts files and fixes them automatically by running the fixup script on watch.

The `tsc` command will output a lot of errors, to keep the terminal output under control you may want to run the three different `embedding-sdk:dev:*` commands on different terminals.
There is a VS code task named `Run embedding sdk dev commands` that does that

## Storybook

TODO

## E2E tests

TODO
