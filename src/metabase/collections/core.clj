(ns metabase.collections.core
  "Main namespace for interacting with collections"
  (:require
   [metabase.collections.models.collection]
   [potemkin :as p]))

(comment
  metabase.collections.models.collection/keep-me)

(p/import-vars
 [metabase.collections.models.collection
  check-non-library-dependencies
  moving-into-library?
  non-library-dependencies])
