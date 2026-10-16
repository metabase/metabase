(ns metabase.library.hooks
  "Hooks that keep the Library in place, implemented by the enterprise module."
  (:require
   [metabase.premium-features.defenterprise :refer [defenterprise]]))

(defenterprise after-startup
  "Hook for after the server starts. The OSS implementation is a no-op."
  metabase-enterprise.library.hooks
  []
  nil)

(defenterprise after-premium-token-update
  "Hook for after the premium token changed, which may have enabled the library feature. The OSS implementation is a
  no-op."
  metabase-enterprise.library.hooks
  []
  nil)
