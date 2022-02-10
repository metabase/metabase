# Metabase plugins

There are different ways a driver's namespaces and dependencies can be packaged:

- Built-in to the core Metabase project.
- In the same repository as the core Metabase project, but built as separate plugins; the plugins are bundled into the uberjar and extracted into the `plugins` directory on launch.
- In a different repository, and built as a separate plugin. To use this kind of driver, you must manually copy the plugin into your `plugins` directory.

## Building a community driver

You should create a plugin in its own repository.

Drivers are packaged as plugins. A Metabase plugin is a JAR file containing compiled class files and a Metabase [plugin manifest](#plugin-manifest). In most cases, plugins are [lazily loaded](#lazy-loading), which means that Metabase won't initialize the drivers until it connects to a database that would use the driver.

- Plugins are JARs that package up a driver's dependencies.
- Plugins live in the plugins directory, by default `./plugins`, or set with `MB_PLUGINS_DIR`.
- Each plugin has a manifest called `metabase.plugin.yaml`.

## All plugins live in the Metabase plugins directory

The plugins directory defaults to `./plugins` in the same directory as `metabase.jar`. For example, your directory structure might look like this:

```
/Users/cam/metabase/metabase.jar
/Users/cam/metabase/plugins/my-plugin.jar
```

You can change the plugin directory by setting the [environment variable][env-var] `MB_PLUGINS_DIR`.

## Plugin manifests

Metabase plugin JARs contain a _plugin manifest_ -- a top-level file named `metabase-plugin.yaml`. When Metabase launches, it iterates over every JAR in the plugins directory, and looks for this file in each. This manifest tells Metabase what the plugin provides and how to initialize it.

## Example manifest

```yaml
info:
  name: Metabase SQLite Driver
  version: 1.0.0-SNAPSHOT-3.25.2
  description: Allows Metabase to connect to SQLite databases.
driver:
  name: sqlite
  display-name: SQLite
  lazy-load: true
  parent: sql-jdbc
  connection-properties:
    - name: db
      display-name: Filename
      placeholder: /home/camsaul/toucan_sightings.sqlite
      required: true
init:
  - step: load-namespace
    namespace: metabase.driver.sqlite
  - step: register-jdbc-driver
    class: org.sqlite.JDBC
```

The `driver` section tells Metabase that the plugin defines a driver named `:sqlite` that has `:sql-jdbc` as a parent. Metabase's plugin system uses these details to call `driver/register!`. The plugin also lists the display name and connection properties for the driver, which Metabase's plugin system uses to creates implementations for `driver/display-name` and `driver/connection-properties`.

For more on writing a manifest, check out our [Metabase plugin manifest reference](plugin-manifest-reference.md).

## Lazy loading

The driver in the [example above](#example-manifest) is listed as `lazy-load: true`, which means that, while the method implementation mentioned above are created when Metabase launches, Metabase won't initialize the driver until the first time someone attempts to connect to a database that uses that driver.

You _can_ (but shouldn't) set a driver to `lazy-load: false`, as this will make Metabase take longer to launch and eat up more memory.

## Plugin initialization

Metabase will initialize plugins automatically as needed. Initialization goes something like this: Metabase adds the driver to the classpath, then it performs ea `init` section of the plugin manifest, in order. In the [example manifest above](#example-manifest), there are two steps, a `load-namespace` step, and a `register-jdbc-driver` step:

```yaml
init:
  - step: load-namespace
    namespace: metabase.driver.sqlite
  - step: register-jdbc-driver
    class: org.sqlite.JDBC
```

## Loading namespaces

You'll need to add one or more `load-namespace` steps to your driver manifest to tell Metabase which namespaces contain your driver method implementations. In the example above, the namespace is `metabase.driver.sqlite`. `load-namespace` calls `require` the [normal Clojure way, meaning it will load other namespaces listed in the `:require` section of its namespace declaration as needed. If your driver's method implementations are split across multiple namespaces, make sure they'll get loaded as well -- you can either have the main namespace handle this (e.g., by including them in the `:require` form in the namespace declaration) or by adding additional `load-namespace` steps. 

For some background on namespaces, see [Clojure namespaces][clojure-namespace].

## Registering JDBC Drivers

Drivers that use a JDBC driver under the hood will need to add a `register-jdbc-driver` step as well. 

The if-you're-interested reason is that Java's JDBC `DriverManager` won't use JDBC drivers loaded with something other than the system `ClassLoader`, which effectively only means `Drivermanager` will only use JDBC driver classes that are packaged as part of the core Metabase uberjar. Since the system classloader doesn't allow you to load the classpath at runtime, Metabase uses a custom `ClassLoader` to initialize plugins. To work around this limitation, Metabase ships with a JDBC proxy driver class that can wrap other JDBC drivers. When Metabase calls `register-jdbc-driver`, Metabase actually registers a new instance of the proxy class that forwards method calls to the actual JDBC driver. `DriverManager` is perfectly fine with this.

## Driver initialization

All drivers, even drivers that aren't packaged as part of plugins, can include additional code to be executed once (and only once) using `metabase.driver/initialize!` when Metabase initializes the driver, that is, before the driver establishes a connection to a database for the first time. (In fact, Metabase uses `metabase.driver/initialize!` to lazy-load the driver.) There are only a few cases where you should use `metabase.driver/initialize`, such as  allocating resources or setting certain system properties.

## Different Ways to Ship Drivers

Now that we understand what Metabase plugins are, let's look at the different ways you can ship Metabase drivers:

## Drivers built-in to the core Metabase project

This is the simplest method of shipping drivers; it's used for the `:postgres`, `:h2`, and `:mysql` drivers, as well as common parents like `:sql` and `:sql-jdbc`. (In fact, before Metabase 0.32, all drivers were shipped this way.)

With this method, dependencies (i.e., JDBC drivers) are included in the core project's `project.clj`, and the drivers themselves are in the found in the same place all other Metabase source is. The file layout will look something like:

```clj
metabase/project.clj                         ; <- deps go in here
metabase/src/metabase/driver/mysql.clj       ; <- main driver namespace
metabase/test/metabase/test/data/mysql.clj   ; <- test extensions
metabase/test/metabase/driver/mysql_test.clj ; <- driver-specific tests go here
```

The only reason these drivers are shipped this way is that these three databases are also supported as application databases, meaning their dependencies would be part of the core Metabase project anyway. When writing a driver for 3rd-party consumption, or one you hope to have merged into the core Metabase project, DO NOT write your driver this way. There are a lot of good reasons to write drivers as separate plugins -- for one, lazy loading improves launch speed and memory consumption.

It might be helpful to start writing a driver this way, since you don't need to work about writing a plugin manifest; but before shipping it, you'll have to move things around to support one of the other delivery methods mentioned below. Thus I'd recommend against starting a driver this way, even for exploratory purposes. **We will not accept any pull requests for drivers packaged this way (i.e., built in to the core product).**

The only situation where you'd might consider shipping a driver this way is as part of a custom fork of Metabase, perhaps because it's only intended for in-house use. ([Even if you'll still have to publish the source for it to comply with the AGPL](https://github.com/metabase/metabase/blob/master/LICENSE.txt)).

## Drivers shipped as part of the core Metabase repo, but packaged as plugins

Check out our list of [official drivers](https://github.com/metabase/metabase/tree/master/modules/drivers) packaged as plugins.

A typical plugin directory layout looks something like the [SQL plugin](https://github.com/metabase/metabase/tree/master/modules/drivers/sqlite).

#### `deps.edn`

With this method, drivers are actually a separate Leiningen project, albeit one in the same Git repository as the core Metabase project. As a separate Leiningen project, it must have a separate `project.clj`; here's Mongo's, for example:


Here's the [`deps.edn` file] for the SQLite driver.


```clj
(defproject metabase/mongo-driver "1.0.0-3.5.0"
  :min-lein-version "2.5.0"

  :dependencies
  [[com.novemberain/monger "3.5.0"]]

  :profiles
  {:provided
   {:dependencies [[metabase-core "1.0.0-SNAPSHOT"]]}

   :uberjar
   {:auto-clean    true
    :aot           :all
    :javac-options ["-target" "1.8", "-source" "1.8"]
    :target-path   "target/%s"
    :uberjar-name  "mongo.metabase-driver.jar"}})
```

Not that it includes the dependencies (`monger`) for the driver as well as a dependency on the `metabase-core` project (we'll explain this more in a second) as well as a profile for building the uberjar. The version is `1.0.0-3.5.0` -- the formula I've used here is `<actual-driver-version>-<dependencies-version>`, but you can use whatever version numbers you feel appropriate; just know the plugin system assumes semantic versioning (e.g. `1.10` is newer than `1.2`).

#### Installing `metabase-core` locally

The dependency on `metabase-core` makes all namespaces that are part of the core Metabase project (e.g. `metabase.driver`) available for use in the driver itself. By putting this dependency in a `provided` profile, `lein uberjar` won't include that dependency in the built driver.

Note that Metabase is not currently available in Clojars or other plugin repositories -- you'll have to install it locally before working on a driver. You can do this by running

```
lein install-for-building-drivers
```

from the root of the core Metabase repository. For now, `metabase-core` has one version -- `1.0.0-SNAPSHOT` -- so this is what your driver should specify. As APIs get locked down in the near future and we ship a Metabase 1.0 release, we'll ship real `[metabase-core "1.0.0"]` (and so forth) dependencies, and most likely publish them on Clojars, meaning you'll be able to skip this step; for now, stick to `[metabase-core "1.0.0-SNAPSHOT"]`. I'll update this guide when this changes.

#### Building a driver plugin shipped as part of the core Metabase repo

A helpful script is included as part of Metabase to build drivers packaged this way:

```bash
./bin/build-driver.sh mongo
```

This will take care of everything and copy the resulting file to `./resources/modules/mongo.metabase-driver.jar`. You can also build the JAR using

```bash
LEIN_SNAPSHOTS_IN_RELEASE=true lein uberjar
```

from the `modules/drivers/mongo` directory; you'll have to copy it into `resources/modules` yourself to have it included with the Metabase uberjar if you're building it locally.

Drivers shipped this way are bundled up inside the uberjar under the `modules` directory (anything in `resources` gets included in the uberjar); anything JARs in the `modules/` directory of the uberjar is extracted into the plugins directory when Metabase starts.

#### Working with the driver from the REPL and in CIDER

Having to install `metabase-core` locally, and build driver uberjars would be obnoxious, especially if you had to repeat it to test every change. Luckily, you can use an included Leiningen profile, `include-all-drivers`, to merge the driver's source paths, test paths, and dependencies into the core Metabase project, letting you run commands as if everything was part of one giant project:

```bash
lein with-profiles +include-all-drivers repl
```

This currently works for a variety of tasks, such as `repl`, `test`, and our various linters. Note it is not currently set up to work when running from source (i.e. with `lein run` or `lein ring server`) -- you'll need to rebuild the driver and install it in your `./plugins` directory instead, and restart when you make changes. This may be fixed in the future, but in the meantime if you want to avoid the slow feedback loop, consider developing your driver using an interactive REPL such as CIDER instead (discussed below), or developing your driver as a "built-in" driver as described above and repackaging it as plugin once everything is finished.

When developing with Emacs and [CIDER](https://github.com/clojure-emacs/cider) sending the universal prefix argument to `cider-jack-in` (i.e. running it with `C-u M-x cider-jack-in`) will prompt you for the command it should use to start the NREPL process; you can add `with-profiles +include-all-drivers` to the beginning of the command to include source paths for your driver.

Of course, you can also work on the driver directly from its `modules/drivers/<driver>` directory -- just note that you won't be able to run tests from that directory, or work on them -- driver test extensions require code in `metabase/test`, which is not bundled up with `metabase-core`; the only way for your driver to have access to the namespaces is to use `with-profiles +include-all-drivers` to simulate an uber-project.

## Drivers shipped as 3rd-party plugins

Package a driver this way if you plan on shipping it as a plugin and don't plan on submitting it as a PR. Fundamentally, the structure is similar to plugins shipped as part of Metabase, but in a separate repo rather than the `modules/drivers/` directory, and without test extensions or tests (at least, without ones that piggyback off the core project's test functionality):

```clj
./project.clj                    ; <- deps go in here
./resources/metabase-plugin.yaml ; <- plugin manifest
./src/metabase/driver/sudoku.clj ; <- main driver namespace
```

Building a driver like this is largely the same as plugins shipped as part of Metabase -- install `metabase-core` locally, then build the driver using `lein uberjar`. Copy the resulting `JAR` file into your plugins directory, and you're off to the races.

[env-var]: ../../operations-guide/environment-variables.html
