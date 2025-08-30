(ns metabase.query-processor.middleware.update-fields
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn- update-fields* :- [:maybe ::lib.schema/stage]
  [query path stage]
  (when (and (= (:lib/type stage) :mbql.stage/mbql)
             (empty? (:breakout stage))
             (empty? (:aggregation stage)))
    (let [cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
      (u/assoc-dissoc stage :fields (not-empty
                                     (into []
                                           (comp (map lib/ref)
                                                 (map (fn [a-ref]
                                                        (cond-> a-ref
                                                          ;; Any coercion or temporal bucketing will already have been done in
                                                          ;; the subquery for the join itself. Mark the parent ref to make sure
                                                          ;; it is not double-coerced, which leads to SQL errors.
                                                          (and (lib.util/clause-of-type? a-ref :field)
                                                               (lib/current-join-alias a-ref))
                                                          (lib/update-options assoc :qp/ignore-coercion true)))))
                                           cols))))))

(mu/defn update-fields :- ::lib.schema/query
  "Add/update `:fields` to each stage of a query that does not have breakouts or aggregations to include all
  the [[lib/returned-columns]] (including those added by joins)."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query update-fields*))
