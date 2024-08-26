---
title: Implementing multimethods for your driver
---

# Implementing multimethods for your driver

Implementing multimethods lets you take advantage of Metabase's existing driver code by extending those methods to work for your particular database.

Let's first focus on the main driver file for our Fox Pro '98 `src/metabase/driver/foxpro98.clj`. Take a look at this sample code:

```clj
;; Define a namespace for the driver
(ns com.mycompany.metabase.driver.foxpro98
  (:require [metabase.driver :as driver]))

;; Can you include a different method here as an example?
(defmethod driver/display-name :foxpro98 [_]
  "Visual FoxPro '98")
```

Let's walk through each code block.

## Driver namespaces

```
;; Define a namespace for the driver
(ns com.mycompany.metabase.driver.foxpro98
  (:require [metabase.driver :as driver]))
```

### Each Metabase driver lives in its own namespace

In this case, the namespace is`com.mycompany.metabase.driver.foxpro98`.
All core Metabase drivers live in `metabase.driver.<name-goes-here>` namespaces. It's probably best to use names that follow the [Java package naming conventions](https://en.wikipedia.org/wiki/Java_package#Package_naming_conventions).

### Many drivers are further broken out into additional namespaces

Especially larger drivers. Commonly, a driver will have a `query-processor` namespace (e.g., `com.mycompany.metabase.driver.foxpro98.query-processor`) that contains the logic for converting MBQL queries (queries built using Metabase's graphical query builder) into native queries (like SQL). The query processor is often the most complicated part of a driver, so keeping that logic separate can help make things easier to work with. Some drivers also have a separate `sync` namespace that has implementations for methods used by Metabase's [database synchronization](../../databases/sync-scan.md).

## Driver initialization

All drivers can include additional code to be executed once (and only once) using `metabase.driver/initialize!` when Metabase initializes the driver, that is, before the driver establishes a connection to a database for the first time. (In fact, Metabase uses `metabase.driver/initialize!` to lazy-load the driver.) There are only a few cases where you should use `metabase.driver/initialize`, such as allocating resources or setting certain system properties.

## `metabase.driver` multimethods

The [`metabase.driver` namespace](https://github.com/metabase/metabase/blob/master/src/metabase/driver.clj) defines a series of [multimethods](https://clojure.org/reference/multimethods), and drivers provide implementations for them, as in our example:

```clj
(defmethod driver/display-name :foxpro98 [_]
  "Visual FoxPro '98")
```

The four main features of a Metabase driver described above are all implemented by multimethods. These methods dispatch on the driver's keyword, `:foxpro98` in our case. In fact, that's all a Metabase driver is -- a keyword! There are no classes or objects to be seen -- just a single keyword.

You can browse the [`metabase.driver` namespace](https://github.com/metabase/metabase/blob/master/src/metabase/driver.clj) for a complete list of multimethods that you could implement. Read the docstring for each method and decide whether you need to implement it. Most methods are optional.

## Listing the available driver multimethods

To quickly look up a list of all driver multimethods, you can run the command

```
clojure -M:run driver-methods
```

which will print a list of all driver namespaces and multimethods. This includes many things like `sql` and `sql-jdbc` multimethods, as well as test extension multimethods.

If you want to see the docstrings for the methods as well, run:

```
clojure -M:run driver-methods docs
```

## Parent drivers

Many drivers share implementation details, and writing complete implementations for sync methods and the like would involve a lot of duplicate code. Thus **many high-level features are partially or fully implemented in shared "parent" drivers**, such as the most common parent, `:sql-jdbc`. A "parent" driver is analogous to a superclass in object-oriented programming.

You can define a driver parent by listing the parent in the [plugin manifest](plugins.md).

Parents like `:sql-jdbc` are intended as a common abstract "base class" for drivers that can share much of their implementation; in the case of `:sql-jdbc`, it's intended for SQL-based drivers that use a JDBC driver under the hood.`:sql-jdbc` and other parents provide implementations for many of the methods needed to power the four main features of a Metabase driver. In fact, `:sql-jdbc` provides implementations of things like `driver/execute-prepared-statement!`, so a driver using it as a parent does not need to provide one itself. However, various parent drivers define their own multimethods to implement.

## Notable parent drivers

These parents are kind of a big deal.

- `:sql-jdbc` can be used as the parent for SQL-based databases with a JDBC driver.
  - `:sql-jdbc` implements most of the four main features, but instead you must implement `sql-jdbc` multimethods found in `metabase.driver.sql-jdbc.*` namespaces, as well as some methods in `metabase.driver.sql.*` namespaces.
- `:sql` is itself the parent of `:sql-jdbc`; it can be used for SQL-based databases that _do not_ have a JDBC driver, such as BigQuery.
  - `:sql` implements a significant chunk of driver functionality, but you must implement some methods found in `metabase.driver.sql.*` namespaces to use it.
- Some drivers use other "concrete" drivers as their parent -- for example, `:redshift` uses `:postgres` as a parent, only supplying method implementations to override postgres ones where needed.

### Calling parent driver implementations

You can get a parent driver's implementation for a method by using `get-method`:

```clj
(defmethod driver/mbql->native :bigquery [driver query]
  ((get-method driver/mbql-native :sql) driver query))
```

This is the equivalent of calling `super.someMethod()` in object-oriented programming.

You must pass the driver argument to the parent implementation as-is so any methods called by that method used the correct implementation. Here's two ways of calling parents that you should avoid:

```clj
(defmethod driver/mbql->native :bigquery [_ query]
  ;; BAD! If :sql's implementation of mbql->native calls any other methods, it won't use the :bigquery implementation
  ((get-method driver/mbql->native :sql) :sql query))
```

also avoid:

```clj
(defmethod driver/mbql->native :bigquery [_ query]
  ;; BAD! If someone else creates a driver using :bigquery as a parent, any methods called by :sql's implementation
  ;; of mbql->native will use :bigquery method implementations instead of custom ones for that driver
  ((get-method driver/mbql->native :sql) :bigquery query))
```

### Multiple parents

Astute readers may have noticed that BigQuery is mentioned as having both `:sql` and `:google` as a parent. This multiple inheritance is allowed and helpful! You can define a driver with multiple parents as follows:

```clj
(driver/register! :bigquery, :parent #{:sql :google})
```

In some cases, both parents may provide an implementation for a method; to fix this ambiguity, simply provide an implementation for your driver and pass them to the preferred parent driver's implementation as described above.

For drivers shipped as a plugin, you'll register methods in the plugin manifest.

## Working with the driver from the REPL and in CIDER

Having to install `metabase-core` locally and build driver uberjars would be obnoxious, especially if you had to repeat it to test every change. Luckily, you can run commands as if everything was part of one giant project:

To start a REPL.

```bash
clojure -A:dev:drivers:drivers-dev
```

You'll need to rebuild the driver and install it in your `./plugins` directory, and restart Metabase when you make changes.
