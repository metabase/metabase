---
title: Development environment
---

# Development environment

The Metabase application has two basic components:

1. A backend written in Clojure which contains a REST API as well as all the relevant code for talking to databases and processing queries.
2. A frontend written as a JavaScript single-page application which provides the web UI.

Both components are built and assembled together into a single JAR file. In the directory where you run the JAR, you can create a JAR file (if Metabase hasn't already created it) and add drivers in there (the drivers are also JARs).

## Quick start

**New to the project?** Run the automated setup:

```
./bin/dev-install
```

This installs [mise](https://mise.jdx.dev) (a tool version manager), sets up your shell, and installs all required tools (Node.js, Java, Clojure, Yarn, Babashka) at the correct versions. Follow the prompts, then open a new terminal.

**Already have your own setup?** You can check that it meets the requirements with `./bin/mage doctor`.

To spin up a development environment, run:

```
yarn dev
```

This runs both the [frontend](#frontend) and [backend](#backend). Alternatively, you can run them separately in two terminal sessions below.

To use any other database beside the default ones please take a look at [Building Drivers](#building-drivers) further down in this document.

To skip the setup wizard and pre-configure users, database connections, and settings, add a [`config.yml`](https://www.metabase.com/docs/latest/configuring-metabase/config-file) to the directory where you run Metabase.

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

## IDE and editor setup

If you use an IDE or editor that runs commands outside your interactive shell (VS Code tasks, Emacs (magit etc.), or IntelliJ run configurations), the tools installed by mise won't be available by default. To fix this, add mise shims to your PATH.

Shims are wrapper scripts that automatically select the correct tool version based on the current directory's `mise.toml`.

First, add this to your shell profile (**.zshrc**, **.bashrc**, **.config/fish/config.fish**):

```bash
export PATH="$HOME/.local/share/mise/shims:$PATH"
```

Then configure your editor:

### VS Code

VS Code usually inherits your shell's PATH if you launch it from the terminal. If not, add to your **settings.json**:

```json
{
  "terminal.integrated.env.osx": {
    "PATH": "${env:HOME}/.local/share/mise/shims:${env:PATH}"
  },
  "terminal.integrated.env.linux": {
    "PATH": "${env:HOME}/.local/share/mise/shims:${env:PATH}"
  }
}
```

### Emacs

Add to your Emacs config (**init.el** or **.emacs**):

```elisp
(add-to-list 'exec-path (expand-file-name "~/.local/share/mise/shims"))
(setenv "PATH" (concat (expand-file-name "~/.local/share/mise/shims") ":" (getenv "PATH")))
```

If you use **exec-path-from-shell**, it should pick up the shims automatically after you update your shell profile.

### IntelliJ / Cursive

Go to **Settings → Tools → Terminal** and add to "Environment variables":

```
PATH=$HOME/.local/share/mise/shims:$PATH
```

For run configurations, you may also need to set the PATH in the run configuration's environment variables.

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

Some systems may have trouble detecting changes to frontend files. You can enable filesystem polling by uncommenting the `watchOptions` clause in `rspack.main.config.js`. If you do this it may be worth making git ignore changes to webpack config, using `git update-index --assume-unchanged rspack.main.config.js`

We exclude ESLint loader in dev mode for seven times quicker initial builds by default. You can enable it by exporting an environment variable:

```sh
$ USE_ESLINT=true yarn build-hot
```

### Frontend testing

Run all unit and Cypress end-to-end tests with

```
yarn test
```

Cypress tests and some unit tests are located in `frontend/test` directory. New unit test files are added next to the files they test.

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

You can also start a REPL another way (e.g., through your editor) and then call:

```
(do (dev) (start!))
```

To start the server (at `localhost:3000`). This will also set up or migrate your application database. To actually
use Metabase, don't forget to start the frontend as well (e.g. with `yarn build-hot`).

### Multiple Instances

By default Rspack runs the development server on port `8088`. You can run multiple instances of Metabase on the same machine by specifying a different port for each instance.

Frontend:

- If you are running the frontend with `yarn build-hot`, set the `MB_FRONTEND_DEV_PORT` environment variable: `MB_FRONTEND_DEV_PORT=8089 MB_EDITION=ee yarn build-hot`
- If you are building the frontend statically with `yarn build`, there is nothing different to do

Backend:

- Set the `MB_JETTY_PORT` environment variable and `MB_FRONTEND_DEV_PORT` to the same one as for the frontend.

### The application database

By default, Metabase uses H2 for its application database, but we recommend using Postgres. This is configured with
several properties that can be set as environment variables or in a `deps.edn`. One approach is:

```
;; ~/.clojure/deps.edn

{:aliases
 {:user
  {:jvm-opts
   ["-Dmb.db.host=localhost"
    "-Dmb.db.type=postgres"
    "-Dmb.db.user=<username>"
    "-Dmb.db.dbname=<dbname>"
    "-Dmb.db.pass="]}}}
```

You could also pass a full connection string in as the `mb.db.connection.uri`:

```
"-Dmb.db.connection.uri=postgres://<user>:<password>@localhost:5432/<dbname>"
```

Besides using environment variables, there is the option to interface with the configuration library [environ](https://github.com/weavejester/environ) directly.

This approach requires creating a `.lein-env` file within your project directory:

```
{:mb-db-type   "postgres"
 :mb-db-host   "localhost"
 :mb-db-user   "<username>"
 :mb-db-dbname "<dbname>"
 :mb-db-pass   ""}
```

Despite the name, this file works fine with `deps.edn` projects. An advantage of this approach versus the global `deps.edn` approach is that it is scoped to this project only.

Only use this for development, it is not supported for production use. There is already entry in `.gitignore` to prevent you accidentally committing this file.

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
clojure -X:dev:test :only metabase.session.api-test

# run one specific test (pass in a qualified symbol)
clojure -X:dev:test :only metabase.session.api-test/my-test

# run tests in one specific folder (test/metabase/util in this example)
# pass arg in double-quotes so Clojure CLI interprets it as a string;
# our test runner treats strings as directories
clojure -X:dev:test :only '"test/metabase/util"'
```

As in any clojure.test project, you can also run unit tests from the REPL. Some examples of useful ways to run tests are:

```clojure
;; run a single test with clojure.test
some-ns=> (clojure.test/run-test metabase.util-test/add-period-test)

Testing metabase.util-test

Ran 1 tests containing 4 assertions.
0 failures, 0 errors.
{:test 1, :pass 4, :fail 0, :error 0, :type :summary}

;; run all tests in the namespace
some-ns=> (clojure.test/run-tests 'metabase.util-test)

Testing metabase.util-test
{:result true, :num-tests 100, :seed 1696600311261, :time-elapsed-ms 45, :test-var "pick-first-test"}

Ran 33 tests containing 195 assertions.
0 failures, 0 errors.
{:test 33, :pass 195, :fail 0, :error 0, :type :summary}

;; run tests for a set of namespaces related to a feature you are working on (eg pulses)
some-ns=> (let [namespaces '[metabase.pulse.markdown-test metabase.pulse.parameters-test]]
            (apply require namespaces) ;; make sure the test namespaces are loaded
            (apply clojure.test/run-tests namespaces))

Testing metabase.pulse.markdown-test

Testing metabase.pulse.parameters-test

Ran 5 tests containing 147 assertions.
0 failures, 0 errors.
{:test 5, :pass 147, :fail 0, :error 0, :type :summary}

;; but we also have a lovely test runner with lots of cool options
some-ns=> (metabase.test-runner/find-and-run-tests-repl {:namespace-pattern ".*pulse.*"})
Running tests with options {:mode :repl, :namespace-pattern ".*pulse.*", :exclude-directories ["classes" "dev" "enterprise/backend/src" "local" "resources" "resources-ee" "src" "target" "test_config" "test_resources"], :test-warn-time 3000}
Excluding directory "dev/src"
Excluding directory "local/src"
Looking for test namespaces in directory test
Finding tests took 1.6 s.
Excluding directory "test_resources"
Excluding directory "enterprise/backend/src"
Looking for test namespaces in directory enterprise/backend/test
Excluding directory "src"
Excluding directory "resources"
Running 159 tests
...

;; you can even specify a directory if you're working on a subfeature like that
some-ns=> (metabase.test-runner/find-and-run-tests-repl {:only "test/metabase/pulse/"})
Running tests with options {:mode :repl, :namespace-pattern #"^metabase.*", :exclude-directories ["classes" "dev" "enterprise/backend/src" "local" "resources" "resources-ee" "src" "target" "test_config" "test_resources"], :test-warn-time 3000, :only "test/metabase/pulse/"}
Running tests in "test/metabase/pulse/"
Looking for test namespaces in directory test/metabase/pulse
Finding tests took 37.0 ms.
Running 65 tests
...

```

#### Testing drivers

By default, the tests only run against the `h2` driver. You can specify which drivers to run tests against with the env var `DRIVERS`:

```
DRIVERS=h2,postgres,mysql,mongo clojure -X:dev:drivers:drivers-dev:test
```

Some drivers require additional environment variables when testing since they are impossible to run locally (such as
Redshift and Bigquery). The tests will fail on launch and let you know what parameters to supply if needed.

If running tests from the REPL, you can call something like:

```
(mt/set-test-drivers! #{:postgres :mysql :h2})
```

Most drivers need to be able to load some data (a few use static datasets) and all drivers need to be able to connect to an instance of that database. You can find out what is needed in each's drivers test data namespace which follows that pattern `metabase.test.data.<driver>`.

There should be an implementation of a multimethod tx/dbdef->connection-details which must produce a way to connect to a database. You can see what is required.

Here's the one for postgres in `metabase.test.data.postgres`:

```clojure
(defmethod tx/dbdef->connection-details :postgres
  [_ context {:keys [database-name]}]
  (merge
   {:host     (tx/db-test-env-var-or-throw :postgresql :host "localhost")
    :port     (tx/db-test-env-var-or-throw :postgresql :port 5432)
    :timezone :America/Los_Angeles}
   (when-let [user (tx/db-test-env-var :postgresql :user)]
     {:user user})
   (when-let [password (tx/db-test-env-var :postgresql :password)]
     {:password password})
   (when (= context :db)
     {:db database-name})))
```

You can see that this looks in the environment for:

- host (defaults to "localhost")
- port (defaults to 5432)
- user
- password

The function names indicate if they throw or not (although in this instance the ones that would throw are also supplied default values).

The `(tx/db-test-env-var :postgresql :password)` will look in the env/env map for `:mb-postgresql-test-password` which will be set by the environmental variable `MB_POSTGRESQL_TEST_PASSWORD`.

```clojure
some-ns=> (take 10 (keys environ.core/env))
(:mb-redshift-test-password
 :java-class-path
 :path
 :mb-athena-test-s3-staging-dir
 :iterm-profile
 :mb-snowflake-test-warehouse
 :mb-bigquery-cloud-sdk-test-service-account-json
 :tmpdir
 :mb-oracle-test-service-name
 :sun-management-compiler)
```

### Running the linters

`clj-kondo` must be [installed separately](https://github.com/clj-kondo/clj-kondo/blob/master/doc/install.md).

```
# Run clj-kondo
mage kondo

# Lint the migrations file (if you've written a database migration):
mage lint-migrations

# Run Eastwood
clojure -X:dev:ee:ee-dev:drivers:drivers-dev:eastwood

# Run the namespace checker
clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:namespace-checker
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
