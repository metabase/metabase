(ns metabase.appearance.queries
  "Application database queries for the appearance module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn unarchived-dashboard-exists?
  "Whether an unarchived Dashboard with `dashboard-id` exists."
  [dashboard-id]
  (t2/exists? :model/Dashboard :id dashboard-id :archived false))
