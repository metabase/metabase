---
title: Development environment
---

# Development environment

The Metabase application has two basic components:

1. A backend written in Clojure which contains a REST API as well as all the relevant code for talking to databases and processing queries.
2. A frontend written as a Javascript single-page application which provides the web UI.

Both components are built and assembled together into a single JAR file. In the directory where you run the JAR, you can create a JAR file (if Metabase hasn't already created it) and add drivers in there (the drivers are also JARs).

## Quick start

To spin up a development environment, you'll need to start two terminal sessions: one for the [frontend](#frontend) and one for the [backend](#backend).

### Frontend

Metabase depends on third-party libraries to run, so you'll need to keep those up to date. The Clojure CLI will automatically fetch the dependencies when needed. With JavaScript dependencies, however, you'll need to kick off the installation process manually.

```sh
# javascript dependencies
$ yarn
```

Start the frontend build process with

```
yarn build-hot
```

See [Frontend development](#frontend-development).

### Backend


Run your backend development server with

```
clojure -M:run

```

See [backend development](#backend-development).

## Frontend development

We use these technologies for our FE build process to allow us to use modules, es6 syntax, and css variables.

- webpack
- babel
- cssnext

Frontend tasks are executed using `yarn`. All available tasks can be found in `package.json` under _scripts_.

To build the frontend client without watching for changes, you can use:

```sh
$ yarn build
```

If you're working on the frontend directly, you'll most likely want to reload changes on save, and in the case of React components, do so while maintaining state. To start a build with hot reloading, use:

```sh
$ yarn build-hot
```

Note that at this time if you change CSS variables, those changes will only be picked up when a build is restarted.

There is also an option to reload changes on save without hot reloading if you prefer that.

```sh
$ yarn build-watch
```

Some systems may have trouble detecting changes to frontend files. You can enable filesystem polling by uncommenting the `watchOptions` clause in `webpack.config.js`. If you do this it may be worth making git ignore changes to webpack config, using `git update-index --assume-unchanged webpack.config.js`

We exclude ESLint loader in dev mode for seven times quicker initial builds by default. You can enable it by exporting an environment variable:

```sh
$ USE_ESLINT=true yarn build-hot
```

By default, these build processes rely on a memory cache. The build process with ESLint loader enabled uses a large amount of memory and may take a considerable amount of time to start (1 - 2 minutes or more). FE developers (or anyone else who frequently restarts FE builds) are encouraged to use webpack's filesystem cache option for much better start-up performance:

```sh
$ FS_CACHE=true yarn build-hot
```

When using `FS_CACHE=true` you may need to remove the `node_modules/.cache` directory to fix scenarios where the build may be improperly cached, and you must run `rm -rf node_modules/.cache` in order for the build to work correctly when alternating between open source and enterprise builds of the codebase.

### Frontend testing

Run all unit and Cypress end-to-end tests with

```
yarn test
```

Cypress tests and some unit tests are located in `frontend/test` directory. New unit test files are added next to the files they test.

If you are using `FS_CACHE=true`, you can also use `FS_CACHE=true` with `yarn test`.

### Frontend debugging

By default, we use a simple source mapping option that is optimized for speed.

If you run into issues with breakpoints, especially inside jsx, please set env variable `BETTER_SOURCE_MAPS` to true before you run the server.

Example:

```
BETTER_SOURCE_MAPS=true yarn dev
```

### Cypress end-to-end tests

End-to-end tests simulate realistic sequences of user interactions. Read more about how we approach [end-to-end testing with Cypress](./e2e-tests.md).

Cypress end-to-end tests use an enforced file naming convention `<test-suite-name>.cy.spec.js` to separate them from unit tests.

### Jest unit tests

Unit tests are focused around isolated parts of business logic.

Unit tests use an enforced file naming convention `<test-suite-name>.unit.spec.js` to separate them from end-to-end tests.

```
yarn test-unit # Run all tests at once
yarn test-unit-watch # Watch for file changes
```

## Backend development

Clojure REPL is the main development tool for the backend. There are some directions below on how to setup your REPL for easier development.

And of course your Jetty development server is available via

```
clojure -M:run
```

### Building drivers

Most of the drivers Metabase uses to connect to external data warehouse databases are separate projects under the
`modules/` subdirectory. When running Metabase via `clojure`, you'll need to build these drivers in order to have access
to them. You can build drivers as follows:

```
# Build the 'mongo' driver
./bin/build-driver.sh mongo
```

(or)

```
# Build all drivers
./bin/build-drivers.sh
```

### Including driver source paths for development or other tasks

For development when running various Clojure tasks you can add the `drivers` and `drivers-dev` aliases to merge the
drivers' dependencies and source paths into the Metabase project:

```
# Install dependencies, including for drivers
clojure -P -X:dev:ci:drivers:drivers-dev
```

### Running unit tests

Run unit tests with

```
# OSS tests only
clojure -X:dev:test

# OSS + EE tests
clojure -X:dev:ee:ee-dev:test
```

or a specific test (or test namespace) with

```
# run tests in only one namespace (pass in a symbol)
clojure -X:dev:test :only metabase.api.session-test

# run one specific test (pass in a qualified symbol)
clojure -X:dev:test :only metabase.api.session-test/my-test

# run tests in one specific folder (test/metabase/util in this example)
# pass arg in double-quotes so Clojure CLI interprets it as a string;
# our test runner treats strings as directories
clojure -X:dev:test :only '"test/metabase/util"'
```

#### Testing drivers

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `DRIVERS`:

```
DRIVERS=h2,postgres,mysql,mongo clojure -X:dev:drivers:drivers-dev:test
```

Some drivers require additional environment variables when testing since they are impossible to run locally (such as Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

### Running the linters

`clj-kondo` must be [installed separately](https://github.com/clj-kondo/clj-kondo/blob/master/doc/install.md).

```
# Run Eastwood
clojure -X:dev:ee:ee-dev:drivers:drivers-dev:eastwood

# Run the namespace checker
clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:namespace-checker

# Run clj-kondo
clj-kondo --parallel --lint src shared/src enterprise/backend/src --config .clj-kondo/config.edn
```

## Continuous integration

All frontend and backend linters and tests can be executed with

```sh
$ yarn ci
```

It is also possible to execute front-end and back-end checks separately

```sh
$ yarn ci-frontend
$ yarn ci-backend
```
