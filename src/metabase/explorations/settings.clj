(ns metabase.explorations.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting explorations-worker-count
  "How many exploration queries a single Metabase node runs at once."
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false)
