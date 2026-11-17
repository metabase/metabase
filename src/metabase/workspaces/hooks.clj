(ns metabase.workspaces.hooks
  "Hooks that keep the table remappings of a Database in step with its workspace schema, implemented by the
  enterprise module."
  (:require
   [metabase.models.interface :as mi]
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise before-update
  "Hook for `row` of `model` before it is updated, which does nothing without workspaces."
  metabase-enterprise.workspaces.hooks
  [_model _row]
  nil)

(mi/define-hook-trait :hook/workspaces
  {:before-update before-update})
