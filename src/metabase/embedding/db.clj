(ns metabase.embedding.db
  "Application database queries for the embedding module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn count-embedded-cards :- ms/IntGreaterThanOrEqualToZero
  "Number of Cards that have embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true))

(mu/defn count-embedded-dashboards :- ms/IntGreaterThanOrEqualToZero
  "Number of Dashboards that have embedding enabled."
  []
  (t2/count :model/Dashboard :enable_embedding true))
