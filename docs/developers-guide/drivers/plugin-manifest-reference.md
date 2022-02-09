# The Metabase plugin manifest reference


```yaml
# Basic user-facing information about the driver goes under the info: key
info:

  # Make sure to give your plugin a name. In the future, we can show
  # this to the user in a 'plugin management' admin page.
  name: Metabase SQLite Driver

  # For the sake of consistency with the core Metabase project you
  # should use semantic versioning. It's not a bad idea to include the
  # version of its major dependency (e.g. a JDBC driver) when
  # applicable as part of the 'patch' part of the version, so we can
  # update dependencies and have that reflected in the version number
  #
  # For now core Metabase modules should have a version
  # 1.0.0-SNAPSHOT-x until version 1.0 ships and the API for plugins
  # is locked in
  version: 1.0.0-SNAPSHOT-3.25.2

  # Describe what your plugin does. Not used currently, but in the
  # future I plan to use this in a plugins admin page.
  description: Allows Metabase to connect to SQLite databases.

# You can list any dependencies needed by the plugin by specifying a
# list of dependencies. If all dependencies are not met, the plugin
# will not be initialized.
#
# A dependency may be either a 'class' or (in the future) a 'plugin' dependency
dependencies: 

  # A 'class' dependency checks whether a given class is available on
  # the classpath. It does not initialize the class; this is deferred
  # until it is actually used (e.g. when initializing the driver that
  # uses it)
  #
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
# In the near future I think I might move init steps into driver itself (or 
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

  # You can also tell Metabase to include SSL tunnel configuration options with 
  # connection-properties-include-tunnel-config (default: false)
  connection-properties-include-tunnel-config: true

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

  # [NOT YET IMPLEMENTED] In the very near future I think I am going to change
  # this to look like:
  # I also might make these a subkey under driver instead (or even make driver just one
  # one many possible things that can be initialized?)
  - load-namespace: metabase.driver.sqlite
  - register-jdbc-driver: org.sqlite.JDBC
```
