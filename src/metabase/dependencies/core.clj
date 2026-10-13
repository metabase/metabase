(ns metabase.dependencies.core
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise entity-inserted!
  "Hook for the `model` row `instance` being inserted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise entity-updated!
  "Hook for the `model` row `instance` being updated, whose Toucan changes say what changed. The OSS implementation is
  a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise entity-deleted!
  "Hook for the `model` row `instance` being deleted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)
