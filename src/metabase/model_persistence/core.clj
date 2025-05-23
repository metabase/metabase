(ns metabase.model-persistence.core
  (:require
   [metabase.model-persistence.models.persisted-info]
   [potemkin :as p]))

(comment metabase.model-persistence.models.persisted-info/keep-me)

(p/import-vars
 [metabase.model-persistence.models.persisted-info
  allow-persisted-substitution?
  invalidate!
  metadata->definition
  query-hash
  with-persisted-substituion-disabled])
