(ns metabase-enterprise.semantic-layer.core
  (:require
   [metabase-enterprise.semantic-layer.validation :as validation]
   [potemkin :as p]))

(comment
  validation/keep-me)

(p/import-vars
 [metabase-enterprise.semantic-layer.validation
  check-allowed-content])
