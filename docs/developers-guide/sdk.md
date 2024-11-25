---
title: Developing the Embedded analytics SDK
---

# Developing the Embedded analytics SDK

These docs are for developing the SDK. For using the SDK in your app, see our [SDK docs](../embedding/sdk/introduction.md).

## Building locally

First you need to build the Metabase Embedding SDK for React locally:

```bash
yarn build-release:cljs
```

## Build and watch

And then run:

```bash
yarn build-embedding-sdk:watch
```
`build-embedding-sdk:watch` is the original command, the js output is fast, but the dts output is extremely slow and is not fixed by the fixup script on watch.

## Build incrementally

```bash
yarn build-embedding-sdk:dev
```

This is an _experimental_ command that should be much faster, it uses `tsc --incremental` to to generate the dts files and fixes them automatically by running the fixup script on watch.

The `tsc` command will output a lot of errors, to keep the terminal output under control you may want to run the three different `embedding-sdk:dev:*` commands on different terminals.
There is a VS code task named `Run embedding sdk dev commands` that does that

## Storybook

You can use storybook to run SDK components during local development.

When you have Metabase instance running:

```bash
yarn storybook-embedding-sdk
```

## Initial configuration

1. Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication >
   JWT > String used by the JWT signing key
1. Make sure "User Provisioning" setting is set to "`on`".
1. Set Authorized Origins to "`*`" in Admin > Embedding > Interactive embedding

## Using the local build

After that you need to add this built SDK package location to your package.json. In this example we assume that your
application is located in the same directory as Metabase directory:

```json
"dependencies": {
"@metabase/embedding-sdk-react": "file:../metabase/resources/embedding-sdk"
}
```

And then you can install the package using npm or yarn:

```bash
npm install
# or
yarn
```

## Releases

Embedding SDK package build happens with Github actions if `embedding-sdk-build` label has been set on the PR.

Published package will use a version from `package.template.json` + current date and commit short hash.
