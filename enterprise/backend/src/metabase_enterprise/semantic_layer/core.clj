(ns metabase-enterprise.semantic-layer.core
  (:require
   [metabase-enterprise.semantic-layer.validation]
   [potemkin :as p]))

(comment
  metabase-enterprise.semantic-layer.validation/keep-me)

(p/import-vars
 [metabase-enterprise.semantic-layer.validation
  check-allowed-content])
