(ns metabase.dependencies.core
  "The OSS namespace for dependency tracking."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise replace-upstream-deps:card!
  "OSS Version, does nothing."
  metabase-enterprise.dependencies.core
  [_card]
  nil)

(defenterprise delete-deps!
  "OSS Version, does nothing."
  metabase-enterprise.dependencies.core
  [_entity-type _id]
  nil)
