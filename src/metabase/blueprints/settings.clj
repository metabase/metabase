(ns metabase.blueprints.settings
  (:require
   [metabase.settings.core :as setting :refer [defsetting]]))

(defsetting blueprints
  "Info about blueprints for this database"
  :visibility :internal
  :type       :json
  :export?    true
  :default    {}
  :encryption :no)
