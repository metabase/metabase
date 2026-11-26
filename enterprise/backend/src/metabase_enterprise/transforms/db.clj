(ns metabase-enterprise.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn succeeded-run-counts-by-meter
  "Rows of `:metered_as` and `:cnt` of the TransformRuns that succeeded on `date`."
  [date :- ms/TemporalInstant]
  (t2/query {:select   [:r.metered_as [[:count :r.id] :cnt]]
             :from     [[(t2/table-name :model/TransformRun) :r]]
             :where    [:and
                        [:= :r.status "succeeded"]
                        [:= [:cast :r.end_time :date] [:cast date :date]]]
             :group-by [:r.metered_as]}))
