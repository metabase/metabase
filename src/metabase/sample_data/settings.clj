(ns metabase.sample-data.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [toucan2.core :as t2]))

(defsetting has-sample-database?
  "Whether this instance has a Sample Database database"
  :type       :boolean
  :visibility :authenticated
  :setter     :none
  :getter     (fn [] (t2/exists? :model/Database, :is_sample true))
  :doc        false)
