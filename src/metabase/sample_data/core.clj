(ns metabase.sample-data.core
  (:require
   [metabase.sample-data.impl]
   [potemkin :as p]))

(comment metabase.sample-data.impl/keep-me)

(p/import-vars
 [metabase.sample-data.impl
  extract-and-sync-sample-database!
  update-sample-database-if-needed!])
