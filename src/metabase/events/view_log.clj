(ns metabase.events.view-log
  (:require
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]))

;; TODO move this setting and remove this namespace

(defsetting dismissed-custom-dashboard-toast
  (deferred-tru "Toggle which is true after a user has dismissed the custom dashboard toast.")
  :user-local :only
  :visibility :authenticated
  :type :boolean
  :default false)
