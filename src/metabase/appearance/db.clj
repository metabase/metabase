(ns metabase.appearance.db
  "Application database queries for the appearance module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn unarchived-dashboard-exists?
  "Whether an unarchived Dashboard with `dashboard-id` exists."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Dashboard :id dashboard-id :archived false))
