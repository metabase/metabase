(ns metabase.bug-reporting.db
  "Application database queries for the bug reporting module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn database-engines
  "The set of engines of all Databases."
  []
  (t2/select-fn-set :engine :model/Database))
