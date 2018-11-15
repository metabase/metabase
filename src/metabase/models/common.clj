(ns metabase.models.common)

(require '[clj-time.core :as t])

(def timezones
  "The different timezones supported by Metabase.
   Presented as options for the `report-timezone` Setting in the admin panel."
  (into [] (t/available-ids)))
