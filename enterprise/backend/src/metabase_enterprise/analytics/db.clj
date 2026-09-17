(ns metabase-enterprise.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn sandbox-exists?
  "Whether any Sandbox exists."
  []
  (t2/exists? :model/Sandbox))
