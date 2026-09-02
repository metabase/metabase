(ns metabase.sample-data.settings
  (:require
   [metabase.sample-data.queries :as sample-data.queries]
   [metabase.settings.core :refer [defsetting]]))

(defsetting has-sample-database?
  "Whether this instance has a Sample Database database"
  :type       :boolean
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (sample-data.queries/sample-database-exists?))
  :doc        false)
