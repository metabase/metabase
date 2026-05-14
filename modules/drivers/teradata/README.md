# Metabase Teradata Driver (Community-Supported)

The Metabase Teradata driver allows Metabase SNAPSHOT to connect to [Teradata](https://www.teradata.com/) databases.
Instructions for installing it can be found below.
As soon as the required commit is merged into a future Metabase release version, this driver can be aligned with Metabase tags. 

This driver is community-supported and is not considered part of the
core Metabase project. If you would like to open a GitHub issue to
report a bug or request new features, or would like to open a pull
requests against it, please do so in this repository, and not in the
core Metabase GitHub repository.

## Obtaining the Teradata Driver

### Where to find it

[Click here](https://github.com/swisscom-bigdata/metabase-teradata-driver/releases/latest) to view the latest release of the Metabase Teradata driver; click the link to download `teradata.metabase-driver.jar`.

You can find past releases of the Teradata driver [here](https://github.com/swisscom-bigdata/metabase-teradata-driver/releases).


### How to Install it

Metabase will automatically make the Teradata driver available if it finds the driver and the proprietary jdbc JARs in the Metabase plugins directory when it starts up.
All you need to do is create the directory `plugins` (if it's not already there), move the JAR you just downloaded into it, and restart Metabase.

By default, the plugins directory is called `plugins`, and lives in the same directory as the Metabase JAR.

For example, if you're running Metabase from a directory called `/app/`, you should move the Teradata driver and the proprietary jdbc JARs to `/app/plugins/`:

```bash
# example directory structure for running Metabase with Teradata support
/app/metabase.jar
/app/plugins/teradata.metabase-driver.jar
/app/plugins/terajdbc4.jar
```

If you're running Metabase from the Mac App, the plugins directory defaults to `~/Library/Application Support/Metabase/Plugins/`:

```bash
# example directory structure for running Metabase Mac App with Teradata support
/Users/you/Library/Application Support/Metabase/Plugins/teradata.metabase-driver.jar
/Users/you/Library/Application Support/Metabase/Plugins/terajdbc4.jar
```

If you are running the Docker image or you want to use another directory for plugins, you should specify a custom plugins directory by setting the environment variable `MB_PLUGINS_DIR`.


## Building the Teradata Driver Yourself

## One time setup of metabase

You require metabase to be installed alongside of your project
1. cd metadata-teradata-driver/..
2. execute 
   ```
   git clone https://github.com/metabase/metabase
   cd metabase
   clojure -X:deps prep
   cd modules/drivers
   clojure -X:deps prep
   cd ../../../metabase-teradata-driver
   ```

## Build
1. under the metabase folder, check out the desired branch
2. create a link to the right location to the driver:
```
DRIVER_PATH=`readlink -f /home/user/metadata-teradata-driver/`
```
3. 
```
 clojure   -Sdeps "{:aliases {:teradata {:extra-deps {com.metabase/teradata-driver {:local/root \"$DRIVER_PATH\"}}}}}"    -X:build:teradata   build-drivers.build-driver/build-driver!   "{:driver :teradata :project-dir \"$DRIVER_PATH\", :target-dir \"$DRIVER_PATH/target\"}"
```

This will build a file called `target/teradata.metabase-driver.jar` under the driver folder; copy this to your Metabase `./plugins` directory.


## Tests

Invoking the test-runner with `clojure -X` will call the test function with a map of arguments,
which can be supplied either in the alias (via `:exec-args`) or on the command-line, or both.

Invoke it with:

```bash
clj -X:test ...args...
```

This will scan your project's `test` directory for any tests defined
using `clojure.test` and run them.

You may also supply any of the additional command line options:

```
  :dirs - coll of directories containing tests, default= ["test"]
  :nses - coll of namespace symbols to test
  :patterns - coll of regex strings to match namespaces
  :vars - coll of fully qualified symbols to run tests on
  :includes - coll of test metadata keywords to include
  :excludes - coll of test metadata keywords to exclude"
```

If neither :dirs or :nses is supplied, will use:

```
  :patterns [".*-test$"]
```