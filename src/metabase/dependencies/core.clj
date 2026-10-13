(ns metabase.dependencies.core
  "Hooks that keep the dependency graph current as content is written, implemented by the enterprise module."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise entity-inserted!
  "Hook for the `model` row `instance` before it is inserted, whose `opts` name the `:owner-model` and `:owner-id` function
  of the entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)

(defenterprise entity-updated!
  "Hook for the `model` row `instance` before it is updated, whose `opts` name the `:columns` its dependencies come from and
  the `:owner-model` and `:owner-id` function of the entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)

(defenterprise entity-deleted!
  "Hook for the `model` row `instance` before it is deleted, whose `opts` name the `:owner-model` and `:owner-id` function
  of the entity the row is part of, if any."
  metabase-enterprise.dependencies.hooks
  [_model _instance _opts]
  nil)
