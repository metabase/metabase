(ns metabase.indexed-entities.core
  "API namespace for the indexed-entities module."
  (:require
   [metabase.indexed-entities.models.model-index]
   [potemkin :as p]))

(comment metabase.indexed-entities.models.model-index/keep-me)

(p/import-vars
 [metabase.indexed-entities.models.model-index
  value-for-pk])
