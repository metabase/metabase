(ns metabase-enterprise.analytics.db
  "Application database queries for the analytics module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn database-with-engine-exists?
  "Whether a Database whose engine is one of `engines` exists."
  [engines]
  (t2/exists? :model/Database :engine [:in engines]))

(defn sandbox-exists?
  "Whether any Sandbox exists."
  []
  (t2/exists? :model/Sandbox))
