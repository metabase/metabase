(ns metabase.dependencies.native
  "The seam through which the dependencies helpers read native queries, whose parsing lives in the enterprise
  dependencies module: none of them reads anything in OSS."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(set! *warn-on-reflection* true)

(defenterprise native-query-dependencies
  "The dependencies of the native-only `query` as `{entity-type #{entity-id}}`, whose table names resolving reads the
  metadata, none in OSS."
  metabase-enterprise.dependencies.native-validation
  [_query]
  {})
