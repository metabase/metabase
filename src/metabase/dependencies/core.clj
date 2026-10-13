(ns metabase.dependencies.core
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise entity-inserted!
  "Hook for the `model` row `instance` before it is inserted, whose `opts` name the `:owner-model` and `:owner-id` of the
  entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)

(defenterprise entity-updated!
  "Hook for the `model` row `instance` before an update that changes a column its dependencies come from, whose `opts`
  name the `:owner-model` and `:owner-id` of the entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)

(defenterprise entity-deleted!
  "Hook for the `model` row `instance` before it is deleted, whose `opts` name the `:owner-model` and `:owner-id` of the
  entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)
