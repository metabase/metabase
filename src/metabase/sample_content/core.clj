(ns metabase.sample-content.core
  (:require
   [metabase.sample-content.import]
   [potemkin :as p]))

(comment metabase.sample-content.import/keep-me)

(p/import-vars
 [metabase.sample-content.import
  import!])
