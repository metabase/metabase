(ns metabase.dependencies.hooks
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise entity-inserted!
  "Hook for the `model` row `instance` before it is inserted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise entity-updated!
  "Hook for the `model` row `instance` before it is updated, whose Toucan changes say what changes. The OSS implementation
  is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)

(defenterprise entity-deleted!
  "Hook for the `model` row `instance` before it is deleted. The OSS implementation is a no-op."
  metabase-enterprise.dependencies.hooks
  [_model _instance]
  nil)
