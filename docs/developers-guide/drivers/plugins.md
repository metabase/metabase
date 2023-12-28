---
title: Plugin manifests
---

# Plugin manifests

Metabase plugin JARs contain a _plugin manifest_ -- a top-level file named `metabase-plugin.yaml`. When Metabase launches, it iterates over every JAR in the plugins directory, and looks for the manifest in each. This manifest tells Metabase what the plugin provides and how to initialize it.

## Example manifest

```yaml
info:
  name: Metabase SQLite Driver
  version: 1.0.0-SNAPSHOT-3.25.2
  description: Allows Metabase to connect to SQLite databases.
contact-info:
  name: Toucan McBird
  address: toucan.mcbird@example.com
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

## Lazy loading

The driver in the [example above](#example-manifest) is listed as `lazy-load: true`, which means that, while the method implementation mentioned above are created when Metabase launches, Metabase won't initialize the driver until the first time someone attempts to connect to a database that uses that driver.

You _can_ (but shouldn't) set a driver to `lazy-load: false`, as this will make Metabase take longer to launch and eat up more memory.

## Plugin initialization

Metabase will initialize plugins automatically as needed. Initialization goes something like this: Metabase adds the driver to the classpath, then it performs each `init` section of the plugin manifest, in order. In the [example manifest above](#example-manifest), there are two steps, a `load-namespace` step, and a `register-jdbc-driver` step:

```yaml
init:
  - step: load-namespace
    namespace: metabase.driver.sqlite
  - step: register-jdbc-driver
    class: org.sqlite.JDBC
```

## Loading namespaces

You'll need to add one or more `load-namespace` steps to your driver manifest to tell Metabase which namespaces contain your driver method implementations. In the example above, the namespace is `metabase.driver.sqlite`. `load-namespace` calls `require` the [normal Clojure way](https://clojuredocs.org/clojure.core/require), meaning it will load other namespaces listed in the `:require` section of its namespace declaration as needed. If your driver's method implementations are split across multiple namespaces, make sure they'll get loaded as well -- you can either have the main namespace handle this (e.g., by including them in the `:require` form in the namespace declaration) or by adding additional `load-namespace` steps.

For some background on namespaces, see [Clojure namespaces](https://clojure.org/guides/learn/namespaces).

## Registering JDBC Drivers

Drivers that use a JDBC driver under the hood will need to add a `register-jdbc-driver` step as well.

The if-you're-interested reason is that Java's JDBC `DriverManager` won't use JDBC drivers loaded with something other than the system `ClassLoader`, which effectively only means `Drivermanager` will only use JDBC driver classes that are packaged as part of the core Metabase uberjar. Since the system classloader doesn't allow you to load the classpath at runtime, Metabase uses a custom `ClassLoader` to initialize plugins. To work around this limitation, Metabase ships with a JDBC proxy driver class that can wrap other JDBC drivers. When Metabase calls `register-jdbc-driver`, Metabase actually registers a new instance of the proxy class that forwards method calls to the actual JDBC driver. `DriverManager` is perfectly fine with this.

## Building the driver

To build a driver as a plugin JAR, check out the [Build-driver scripts README](https://github.com/metabase/metabase/tree/master/bin/build-drivers.md).

Place the JAR you built in your Metabase's `/plugins` directory, and you're off to the races.

## The Metabase plugin manifest reference

Here's an example plugin manifest with comments to get you started on writing your own.

```
# Basic user-facing information about the driver goes under the info: key
info:

  # Make sure to give your plugin a name. In the future, we can show
  # this to the user in a 'plugin management' admin page.
  name: Metabase SQLite Driver

  # For the sake of consistency with the core Metabase project you
  # should use semantic versioning. It's not a bad idea to include the
  # version of its major dependency (e.g., a JDBC driver) when
  # applicable as part of the 'patch' part of the version, so we can
  # update dependencies and have that reflected in the version number
  #
  # For now core Metabase modules should have a version
  # 1.0.0-SNAPSHOT-x until version 1.0 ships and the API for plugins
  # is locked in
  version: 1.0.0-SNAPSHOT-3.25.2

  # Describe what your plugin does. Not used currently, but in the
  # future we may use this description in a plugins admin page.
  description: Allows Metabase to connect to SQLite databases.

# You can list any dependencies needed by the plugin by specifying a
# list of dependencies. If all dependencies are not met, the plugin
# will not be initialized.
#
# A dependency may be either a 'class' or (in the future) a 'plugin' dependency
dependencies:

  # A 'class' dependency checks whether a given class is available on
  # the classpath. It doesn't initialize the class; Metabase defers initialization
  # until it needs to use the driver
  # Don't use this for classes that ship as part of the plugin itself;
  # only use it for external dependencies.
  - class: oracle.jdbc.OracleDriver

    # You may optionally add a message that will be displayed for
    # information purposes in the logs, and possibly in a plugin
    # management page as well in the future
    message: >
      Metabase requires the Oracle JDBC driver to connect to JDBC databases. See
      https://metabase.com/docs/latest/administration-guide/databases/oracle.html
      for more details

  # A 'plugin' dependency checks whether a given plugin is available.
  # The value for 'plugin' is whatever that plugin has as its 'name:' -- make
  # sure you match it exactly!
  #
  # If the dependency is not available when this module is first loaded, the module
  # will be tried again later after more modules are loaded. This means things will
  # still work the way we expect even if, say, we initially attempt to load the
  # BigQuery driver *before* loading its dependency, the shared Google driver. Once
  # the shared Google driver is loaded, Metabase will detect that BigQuery's
  # dependencies are now satisfied and initialize the plugin.
  #
  # In the future, we'll like add version restrictions as well, but for now we only match
  # by name.
  - plugin: Metabase SQLHeavy Driver

# If a plugin adds a driver it should define a driver: section.
#
# To define multiple drivers, you can pass a list of maps instead. Note
# that multiple drivers currently still must share the same dependencies
# set and initialization steps. Thus registering multiple drivers is most
# useful for slight variations on the same driver or including an abstract
# parent driver. Note that init steps will get ran once for each driver
# that gets loaded. This can result in duplicate driver instances registered
# with the DriverManager, which is certainly not ideal but does not actually
# hurt anything.
#
# In the near future I might move init steps into driver itself (or
# at least allow them there)
driver:

  # Name of the driver; corresponds to the keyword (e.g. :sqlite) used
  # in the codebase
  name: sqlite

  # Nice display name shown to admins when connecting a database
  display-name: SQLite

  # Whether loading this driver can be deferred until the first
  # attempt to connect to a database of this type. Default: true. Only
  # set this to false if absolutely neccesary.
  lazy-load: true

  # Parent driver, if any.
  parent: sql-jdbc

  # You may alternatively specify a list of parents for drivers with
  # more than one:
  parent:
    - google
    - sql

  # Whether this driver is abstract. Default: false
  abstract: false

  # List of connection properties to ask users to set to connect to
  # this driver.
  connection-properties:
    # Connection properties can be one of the defaults found in
    # metabase.driver.common, listed by name:
    - dbname
    - host

    # Or a full map for a custom option. Complete schema for custom
    # options can be found in metabase.driver. NOTE: these are not
    # currently translated for i18n; I'm working on a way to translate
    # these. Prefer using one of the defaults from
    # metabase.driver.common if possible.
    - name: db
      display-name: Filename
      placeholder: /home/camsaul/toucan_sightings.sqlite
      required: true

    # Finally, you can use merge: to merge multiple maps. This is
    # useful to override specific properties in one of the defaults.
    - merge:
      - port
      - placeholder: 1433

# Steps to take to initialize the plugin. For lazy-load drivers, this
# is delayed until the driver is initialized the first time we connect
# to a database with it
init:

  # load-namespace tells Metabase to require a namespace from the JAR,
  # you can do whatever Clojurey things you need to do inside that
  # namespace
  - step: load-namespace
    namespace: metabase.driver.sqlite

  # register-jdbc-driver tells Metabase to register a JDBC driver that
  # will be used by this driver. (It actually registers a proxy
  # driver, because DriverManager won't allow drivers that are loaded
  # by different classloaders than it was loaded by (i.e., the system
  # classloader); don't worry to much about this, but know for
  # JDBC-based drivers you need to include your dependency here)
  - step: register-jdbc-driver
    class: org.sqlite.JDBC
```

## Next up

[Implementing multimethods](multimethods.md) for your driver.
