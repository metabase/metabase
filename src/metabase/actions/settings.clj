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

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether to enable table data editing for a specific Database.")
  :default false
  ;; TODO should only allow being enabled? if the driver supports actions/data-editing
  :feature :table-data-editing
  :type :boolean
  :visibility :public
  :database-local :only
  :export? true)
