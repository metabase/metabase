(ns metabase.sample-data.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.warehouses.db :as warehouses.db]))

(defsetting has-sample-database?
  "Whether this instance has a Sample Database database"
  :type       :boolean
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (warehouses.db/database-exists? {:is_sample true}))
  :doc        false)
