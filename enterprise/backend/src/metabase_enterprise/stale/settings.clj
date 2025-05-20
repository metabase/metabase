(ns metabase-enterprise.stale.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting dismissed-collection-cleanup-banner
  (deferred-tru "Was the collection cleanup banner dismissed?")
  :user-local :only
  :visibility :authenticated
  :type :boolean
  :default false
  :export? false)
