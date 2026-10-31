(ns metabase.prototype.core
  "API namespace for the prototype dataset: mock data for filter prototypes, with slow and fast tables.

  At startup, when the app DB is Postgres, Metabase seeds the dataset into the `prototype_data` schema of the app DB
  and registers it as the \"Prototype Data\" Database; see [[metabase.prototype.init]] and PROTOTYPE.md.

  The query processor requires this namespace, so it must not require sync: sync requires the query processor."
  (:require
   [metabase.prototype.slow-queries]
   [potemkin :as p]))

(comment metabase.prototype.slow-queries/keep-me)

(p/import-vars
 [metabase.prototype.slow-queries
  delay-slow-queries])
