(ns metabase.sample-data.core
  (:require
   [metabase.sample-data.downgrade]
   [metabase.sample-data.impl]
   [potemkin :as p]))

(comment metabase.sample-data.impl/keep-me
         metabase.sample-data.downgrade/keep-me)

(p/import-vars
 [metabase.sample-data.impl
  extract-and-sync-sample-database!
  sample-database-name
  update-sample-database-if-needed!]
 [metabase.sample-data.downgrade
  restore-h2-sample-database-on-downgrade!])
