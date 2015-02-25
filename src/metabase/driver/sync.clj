(ns metabase.driver.sync
  "Functionality related to 'syncing' a `Database` (getting list of `Fields` and info about them).
   This namespace defines multimethods that are implemented by various drivers."
  (:require [metabase.driver.util :as util]))

(defmulti sync-tables
  "Fetch the table names for DATABASE and create corresponding `Tables` if they don't already exist.
  (This is executed in parallel.)"
  (util/db-dispatch-fn "sync"))
