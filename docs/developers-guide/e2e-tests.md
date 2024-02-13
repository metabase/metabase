---
title: End-to-end tests with Cypress
---

# End-to-end tests with Cypress

Metabase uses Cypress for “end-to-end testing”, that is, tests that are executed against the application as a whole, including the frontend, backend, and application database. These tests are essentially scripts written in JavaScript that run in the web browser: visit different URLs, click various UI elements, type text, and assert that things happen as expected (for example, an element appearing on screen, or a network request occuring).

## Getting Started

Metabase’s Cypress tests are located in the `e2e/test/scenarios` source tree, in a structure that roughly mirrors Metabase’s URL structure. For example, tests for the admin “datamodel” pages are located in `e2e/test/scenarios/admin/datamodel`.

### Standard Development Flow
1. Run `yarn build-hot` to continuously build the frontend

2. then `yarn test-cypress-open --browser=electron` to open the Cypress application where you can execute tests you are working on


### Running Options

To run all Cypress tests programmatically in the terminal:
```
yarn run test-cypress-run
```

You can run a specific set of scenarios by using the `--folder` flag, which will pick up the chosen scenarios under `e2e/test/scenarios/`.

```
yarn run test-cypress-run --folder sharing
```

You can quickly test a single file only by using the `--spec` flag.

```
yarn test-cypress-run --spec e2e/test/scenarios/question/new.cy.spec.js
```

## Anatomy of the Test

Cypress test files are structured like Mocha tests, where `describe` blocks are used to group related tests, and `it` blocks are the tests themselves.

```js
describe("homepage",() => {
  it('should load the homepage and...', () => {
    cy.visit("/metabase/url");
    // ...
  })
})
```

We strongly prefer using selectors like `cy.findByText()` and `cy.findByLabelText()` from [`@testing-library/cypress`](https://github.com/testing-library/cypress-testing-library) since they encourage writing tests that don't depend on implementation details like CSS class names.

Try to avoid repeatedly testing pieces of the application incidentally. For example, if you want to test something about the query builder, jump straight there using a helper like `openOrdersTable()` rather than starting from the home page, clicking "New", then "Question", etc.

## Cypress Documentation

* Introduction: https://docs.cypress.io/guides/core-concepts/introduction-to-cypress.html
* Commands: https://docs.cypress.io/api/api/table-of-contents.html
* Assertions: https://docs.cypress.io/guides/references/assertions.html

## Tips/Gotchas

### `contains` vs `find` vs `get`

Cypress has a set of similar commands for selecting elements. Here are some tips for using them:
* `contains` is case-sensitive to the text *in the DOM*. If it’s not matching text you’d expect, check that CSS hasn’t updated the case.
* `contains` matches substrings, so if you see “filter by” and “Add a filter”, `contains(“filter”)` will match both. To avoid these issues, you can either pass a regexp that pins the start/end of the string or pass a selector in addition to the string: `.contains(selector, content)`.
* `find` will let you search within your previous selection. `get` will search the entire page even if chained.

### Increase viewport size to avoid scrolling
Sometimes Metabase views are a bit large for Cypress’s default 1000x660 viewport. This can require you to scroll for tests to work. To avoid that, you can increase the viewport size for a specific test by calling `cy.viewport(width, height)`.

### Code reloading vs test reloading
When you edit a Cypress test file, the tests will refresh and run again. However, when you edit a code file, Cypress won’t detect that change. If you’re running `yarn build-hot`, the code will rebuild and update within Cypress. You’ll have to manually click rerun after the new code has loaded.

### Inspecting while the “contains helper” is open
One great feature of Cypress is that you can use the Chrome inspector after each step of a test. They also helpfully provide a helper that can test out `contains` and `get` calls. This helper creates new UI that prevents inspecting from targeting the correct elements. If you want to inspect the DOM in Chrome, you should close this helper.

### Putting the wrong HTML template in the Uberjar
`yarn build` and `yarn build-hot` each overwrite an HTML template to reference the correct Javascript files. If you run `yarn build` before building an Uberjar for Cypress tests, you won’t see changes to your Javascript reflected even if you then start `yarn build-hot`.

### Running Cypress on M1 machines

You might run into problems when running Cypress on M1 machine.
This is caused by the `@bahmutov/cypress-esbuild-preprocessor` that is using `esbuild` as a dependency. The error might look [like this](https://github.com/evanw/esbuild/issues/1819#issuecomment-1018771557). [The solution](https://github.com/evanw/esbuild/issues/1819#issuecomment-1080720203) is to install NodeJS using one of the Node version managers like [nvm](https://github.com/nvm-sh/nvm) or [n](https://github.com/tj/n).

### Running tests that depend on Docker images

A subset of our tests depend on the external services that are available through the Docker images. At the time of this writing, those are three supported external QA databases, Webmail and LDAP server. It's tedious to have five Docker containers running locally. An escape hatch is provided for people that do not care about these tests, but still need to run specs containing them locally. Run this command:

- `yarn test-cypress-run --env grepTags="-@external" --spec path/to/spec/foo.cy.spec.js`

Please note the minus sign before the `@external` tag. For more details, consult [the official documentation](https://github.com/cypress-io/cypress-grep#filter-with-tags).

### Running tests with Snowplow involved

Tests that depend on Snowplow expect a running server. To run them, you need to:

- run Snowplow locally: `docker-compose -f ./snowplow/docker-compose.yml up -d`
- pass env variables to the test run: `MB_SNOWPLOW_AVAILABLE=true MB_SNOWPLOW_URL=http://localhost:9090 yarn test-cypress-open`

## DB Snapshots

At the beginning of each test suite we wipe the backend's db and settings cache. This ensures that the test suite starts in a predictable state.

Typically, we use the default snapshot by adding `before(restore)` inside the first `describe` block to restore before running the whole test suite. If you want to use a snapshot besides the default one, specify the name as an argument to `restore` like this: `before(() => restore("blank"))`. You can also call `restore()` inside `beforeEach()` to reset before every test, or inside specific tests.

Snapshots are created with a separate set of Cypress tests. These tests start with a blank database and execute specific actions to put the database in predictable state. For example: signup as bob@metabase.com, add a question, turn on setting ABC.

These snapshot-generating tests have the extension `.cy.snap.js`. When these tests run they create db dumps in `frontend/tests/snapshots/*.sql`. They are run before the tests begin and don't get committed to git.

## Running in CI
Cypress records videos of each test run, which can be helpful in debugging. Additionally, failed tests have higher quality images saved.

These files can be found under the “Artifacts” section for each run's summary in GitHub Actions.
The example of the artifacts for a failed test in "Onboarding" directory:
![GitHub Actions artifacts section](https://user-images.githubusercontent.com/31325167/241774190-f19da1d5-8fca-4c48-9342-ead18066bd12.png)

Additionally, you will find a handy [DeploySentinel](https://www.deploysentinel.com/ci/dashboard) recording link for each failed test in the logs.

## Running Cypress tests against Metabase® Enterprise Edition™

Prior to running Cypress against Metabase® Enterprise Edition™, set `MB_EDITION=ee` environment variable. We have a special `describe` block called `describeEE` that will conditionally skip or run tests based on the edition.

**Enterprise instance will start without a premium token!**

If you want to test premium features (feature flags), valid tokens need to be available to all Cypress tests. We achieve this by prefixing environment variables with `CYPRESS_`.
You must provide two tokens that correspond to the `EE/PRO` self-hosted (all features enabled) and `STARTER` Cloud (no features enabled) Metabase plans. For more information, please see [Metabase pricing page](https://www.metabase.com/pricing/).

- `CYPRESS_ALL_FEATURES_TOKEN`
- `CYPRESS_NO_FEATURES_TOKEN`

```
MB_EDITION=ee CYPRESS_ALL_FEATURES_TOKEN=xxxxxx CYPRESS_NO_FEATURES_TOKEN=xxxxxx yarn test-cypress-open
```

If you navigate to the `/admin/settings/license` page, the license input field should display the active token. Be careful when sharing screenshots!

- If tests under `describeEE` block are greyed out and not running, make sure you spun up Metabase® Enterprise Edition™.
- If tests start running but the enterprise features are missing: make sure that the token you use has corresponding feature flags enabled.
- If everything with the token seems to be okay, go nuclear and destroy all Java processes: run `killall java` and restart Cypress.

## Tags

Cypress allows us to [tag](https://github.com/cypress-io/cypress/tree/develop/npm/grep#tags-in-the-test-config-object) tests, to easily find certain categories of tags. For example, we can tag all tests that require an external database with `@external` and then run only those tests with `yarn test-cypress-open --env grepTags="@external"`. Tags should start with `@` just to make it easier to distinguish them from other strings in searches.

These are the tags currently in use:

- `@external` - tests that require an external docker container to run
- `@actions` - tests that use metabase actions and mutate data in a data source

## How to stress-test a flake fix?

Fixing a flaky test locally doesn't mean the fix works in GitHub's CI environment. The only way to be sure the fix works is to stress-test it in CI. That's what `.github/workflows/e2e-stress-test-flake-fix.yml` is made for. It allows you to quickly test the fix in your branch without waiting for the full build to complete.

Please follow these steps:
### Prepare
- Create a new branch with your proposed fix and push it to the remote
- Either skip opening a PR altogether or open a **draft** pull request

### Trigger the stress-test workflow manually
- Go to `https://github.com/metabase/metabase/actions/workflows/e2e-stress-test-flake-fix.yml`
- Click on _Run workflow_ trigger next to "This workflow has a workflow_dispatch event trigger."
1. Choose your own branch in the first field "Use workflow from" (this part is crucial!)
2. Copy and paste the relative path of the spec you want to test (e.g. `e2e/test/scenarios/onboarding/urls.cy.spec.js`) - you don't have to wrap it in quotes
3. Set the desired number of times to run the test
4. Optionally provide a grep filter, according to [the documentation](https://github.com/cypress-io/cypress/tree/develop/npm/grep)
5. Click the green "Run workflow" button and wait for the results

### Things to keep in mind when using this workflow
- It will automatically try to find and download the previously built Metabase uberjar stored as an artifact from one of the past commits / CI runs.
- It was intended to be used for pure E2E fixes that don't require new Metabase uberjar.
- If the fix required a source-code change (either backend of frontend), please open a regular PR instead and let the CI run all tests first. After this,
you can trigger the stress-test workflow manually, as explained above, and it will automatically download newly built artifact from this CI run. Please,
keep in mind that CI needs to fully finish running first. The workflow uses GitHub REST API which doesn't see artifacts otherwise.
