(ns metabase.content-diagnostics.hooks
  "Hooks that invalidate the findings of content diagnostics as the content they flag is archived or deleted,
  implemented by the enterprise module."
  (:require
   [metabase.models.interface :as mi]
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise before-update
  "Hook for `row` of `model` before it is updated, which does nothing without the content diagnostics feature."
  metabase-enterprise.content-diagnostics.hooks
  [_model _row]
  nil)

(defenterprise before-delete
  "Hook for `row` of `model` before it is deleted, which does nothing without the content diagnostics feature."
  metabase-enterprise.content-diagnostics.hooks
  [_model _row]
  nil)

(mi/define-hook-trait :hook/content-diagnostics
  {:before-update before-update
   :before-delete before-delete})
