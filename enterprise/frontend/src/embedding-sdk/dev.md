# Docs for development on the sdk

These docs are for building the sdk locally, if you just want to use the sdk, please refer to the [sdk documentation](https://www.metabase.com/docs/latest/embedding/sdk/introduction).

## Build

You can build the sdk with `yarn build-embedding-sdk`.

### Watch

If you want to have it build when you change a file there are two options:

#### build-embedding-sdk:watch

`yarn build-embedding-sdk:watch` is the original command, the js output is fast, but the dts output is extremely slow and is not fixed by the dts fixup script on watch so typescript definitions may be broken.

#### embedding-sdk:dev

This is an _experimental_ command that should be much faster, it uses `tsc --incremental` to to generate the dts files and fixes them automatically by running the fixup script on watch.

The `tsc` command will output a lot of errors, to keep the terminal output under control you may want to run the three different `embedding-sdk:dev:*` commands on different terminals.
There is a VS code task named `Run embedding sdk dev commands` that does that

## Storybook

Storybook is a quick way of testing sdk components with hot reloading.

Storybook expects an instance running on `localhost:3000` with some configuration:

- on [/admin/settings/authentication/jwt](http://localhost:3000/admin/settings/authentication/jwt)
  - Make sure "User Provisioning" is enabled.
  - Set JWT secret to be "`0000000000000000000000000000000000000000000000000000000000000000`" in Admin > Authentication >
    JWT > String used by the JWT signing key
  - You will need to input a `JWT Identity Provider URI` even though it will not be used.
  - Press "Save and enable"
- on [/admin/settings/embedding-in-other-applications](http://localhost:3000/admin/settings/embedding-in-other-applications)
  - Enable the sdk

Then you can run `yarn storybook-embedding-sdk` to start storybook.

Storybook will use the source files and not the built package.

## E2E tests

E2e tests for the sdk are currently done with cypress component tests.

You'll need to have the following ENVs for running EE E2E tests:

```bash
MB_EDITION=ee
CYPRESS_ALL_FEATURES_TOKEN=  ${usual token from password manager}
CYPRESS_NO_FEATURES_TOKEN=  ${usual token from password manager}
```

And then run:

```bash
yarn test-cypress-open-component-sdk
```

Cypress will use the built package, so we recommend running it together with either the watch or dev command.

## Use the local build in a project

To test a local build of the sdk in a local project, you can install the sdk from the resources folder.

Assuming your projects are in a sibling directory of the metabase core app, you can run

```
yarn add file:../metabase/resources/embedding-sdk
```

or

```
npm install --install-links  ../metabase/resources/embedding-sdk
```

### Common problems

#### Caching issues

Most bundlers optimize npm packages and cache the optimized files aggressively, here's how to clean the cache for the most used bundlers:

next: `rm -rf .next`
vite: `rm -rf node_modules/.vite`
webpack: `rm -rf node_modules/.cache`

We recommend clearing the cache every time you install the sdk, a common workflow is to:

- remove `node_modules/@metabase` to make sure no old files are used
- install the sdk with `yarn add file:../metabase/resources/embedding-sdk` / `npm install --install-links ../metabase/resources/embedding-sdk`
- clean the cache of your bundler

An example for vite: `rm -rf node_modules/@metabase && rm -rf node_modules/.vite && yarn add file:../metabase/resources/embedding-sdk`

We usually create a custom `dev:link` script in the package.json to simplify the process.

#### `Cannot read properties of null (reading 'useRef')`

This happens when multiple versions of react are found in the project.
This often happens because the sdk is installed with a symlink, as the node will resolve `react` starting from the linked folder and find a different one from the one used in the project, It can also happen in mono-repos or if you have nested node projects.
If you installed with npm, try to install the sdk with `--install-links`, this will create a copy of the package instead of a symlink, which should fix the issue.
