(ns metabase.embedding.db
  "Application database queries for the embedding module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn count-embedded-cards
  "Number of Cards that have embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true))

(defn count-embedded-dashboards
  "Number of Dashboards that have embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true))
