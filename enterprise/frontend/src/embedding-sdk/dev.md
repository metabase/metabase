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
  - Press "Save and enable"
- on [/admin/settings/embedding-in-other-applications](http://localhost:3000/admin/settings/embedding-in-other-applications)
  - Enable the sdk

Then you can run `yarn storybook-embedding-sdk` to start storybook.

Storybook will use the source files and not the built package.

## E2E tests

### Component e2e tests

E2e tests for the sdk are currently done with cypress component tests, and located in `e2e/test-component/scenarios/embedding-sdk/`.


You'll need to have the following ENVs for running EE E2E tests:

```bash
MB_EDITION=ee
CYPRESS_ALL_FEATURES_TOKEN=  ${usual token from password manager}
CYPRESS_NO_FEATURES_TOKEN=  ${usual token from password manager}
```

Cypress will use the built package, so you'll have to build the sdk first (see above).
We recommend running either the dev or the watch command to have shorter a feedback loop.

To start the cypress for the e2e tests:

```bash
TEST_SUITE="component" yarn test-cypress
```

### Sample Apps compatibility with Embedding SDK tests

In order to check compatibility between Sample Apps and Embedding SDK, we have a special test suite for each sample app that pulls this Sample App, starts it and runs its Cypress tests against the local `metabase.jar` and local `@metabase/embedding-sdk-react` package.

#### Local runs

To run these tests locally, run:
```
ENTERPRISE_TOKEN=<token> TEST_SUITE=<sample_app_repo_name>-e2e OPEN_UI=false EMBEDDING_SDK_VERSION=local START_METABASE=false GENERATE_SNAPSHOTS=false START_CONTAINERS=false yarn test-cypress
```

For example for the `metabase-nodejs-react-sdk-embedding-sample`, run:
```
ENTERPRISE_TOKEN=<token> TEST_SUITE=metabase-nodejs-react-sdk-embedding-sample-e2e OPEN_UI=false EMBEDDING_SDK_VERSION=local START_METABASE=false GENERATE_SNAPSHOTS=false START_CONTAINERS=false yarn test-cypress
```

##### :warning: Obtaining the Shoppy's Metabase App DB Dump locally
For the Shoppy's Sample App Tests (`TEST_SUITE=shoppy-e2e`) locally, a proper App DB dump of the Shoppy's Metabase Instance must be placed to the `./e2e/tmp/db_dumps/shoppy_metabase_app_db_dump.sql`

You can get it by:
- Enabling the `Tailscale` and logging in using your work email address.
- Running `pg_dump "postgres://{{ username }}:{{ password }}@{{ host }}:{{ port }}/{{ database }}" > ./e2e/tmp/db_dumps/shoppy_metabase_app_db_dump.sql` command.
    - See the `Shoppy Coredev Appdb` record in `1password` for credentials.

#### CI runs

On our CI, test failures do not block the merging of a pull request (PR). However, if a test fails, it’s most likely due to one of the following reasons:

- **Build Failure**:

  The failure occurs during the build of a local `@metabase/embedding-sdk-react` dist. This indicates there is likely a syntax or type error in the front-end code.
- **Test Run Failure**:

  The failure occurs during the actual test execution. In this case, the PR may have introduced a change that either:
    - Breaks the entire Metabase or Embedding SDK, or
    - Breaks the compatibility between the Embedding SDK and the Sample Apps.

If a PR breaks compatibility between the Embedding SDK and the Sample Apps, the PR can still be merged. However, for each Sample App affected, a separate PR should be created to restore compatibility with the new `@metabase/embedding-sdk-react` version when it is released. These compatibility PRs should be merged only once the Embedding SDK version containing breaking changes is officially released.

### Embedding SDK integration tests with Host Apps

When we want to check integration of the Embedding SDK with consumer's apps that use different frameworks/bundlers, or when we want to test some tricky integration cases like conflicting types, we use Host App tests.

Tests a bit similar to Sample App tests, but:
- Host Apps are placed in the `metabase` repo `e2e/embedding-sdk-host-apps/<HOST_APP_NAME>`.
- Host Apps tests are under `e2e/test-host-app/<HOST_APP_NAME>/*`.
- Host app contains the client application only that is run in a Docker container during e2e testing.
- Tests use the regular Cypress backend and Cypress infrastructure, so we can mock anything and use Cypress helpers.

#### Local runs

To run these tests locally, run:
```
ENTERPRISE_TOKEN=<token> TEST_SUITE=<host_app_name>-e2e OPEN_UI=false EMBEDDING_SDK_VERSION=local HOST_APP_ENVIRONMENT=production yarn test-cypress
```

For example for the `vite-6-host-app` Host App, run:
```
ENTERPRISE_TOKEN=<token> TEST_SUITE=vite-6-host-app-e2e OPEN_UI=false EMBEDDING_SDK_VERSION=local HOST_APP_ENVIRONMENT=production yarn test-cypress
```

#### CI runs

Same as for Sample App tests - failures don't block a PR from being merged.

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
