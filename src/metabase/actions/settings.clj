(ns metabase.actions.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n]))

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable Actions for a specific Database.")
  :default false
  :type :boolean
  :visibility :public
  :database-local :only)
