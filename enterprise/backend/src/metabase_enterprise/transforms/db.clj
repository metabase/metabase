(ns metabase-enterprise.transforms.db
  "Application database queries for the transforms module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn cache-table-dependencies!
  "Store `dependencies-json` as the cached table dependencies of the Transform with `transform-id`."
  [transform-id dependencies-json]
  (t2/update! (t2/table-name :model/Transform) transform-id {:table_dependencies dependencies-json}))

(defn succeeded-run-counts-by-meter
  "Rows of `:metered_as` and `:cnt` of the TransformRuns that succeeded on `date`."
  [date]
  (t2/query {:select   [:r.metered_as [[:count :r.id] :cnt]]
             :from     [[:transform_run :r]]
             :where    [:and
                        [:= :r.status "succeeded"]
                        [:= [:cast :r.end_time :date] [:cast date :date]]]
             :group-by [:r.metered_as]}))
