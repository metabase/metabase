(ns metabase-enterprise.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn database-with-engine-exists? :- :boolean
  "Whether a Database whose engine is one of `engines` exists."
  [engines :- [:sequential :keyword]]
  (t2/exists? :model/Database :engine [:in engines]))

(mu/defn sandbox-exists? :- :boolean
  "Whether any Sandbox exists."
  []
  (t2/exists? :model/Sandbox))
