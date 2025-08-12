(ns metabase.actions.settings
  (:require
   [metabase.settings.core :as setting]
   [metabase.util.i18n :as i18n]
   [metabase.warehouses.models.database :as database]))

(setting/defsetting database-enable-actions
  (i18n/deferred-tru "Whether to enable Actions for a specific Database.")
  :default        false
  :driver-feature :actions
  :type           :boolean
  :visibility     :public
  :database-local :only)

(setting/defsetting database-enable-table-editing
  (i18n/deferred-tru "Whether to enable table data editing for a specific Database.")
  :default        false
  :feature        :table-data-editing
  :driver-feature :actions/data-editing
  :enabled-for-db?  (complement database/is-destination?)
  :type           :boolean
  :visibility     :public
  :database-local :only
  :export?        true)
