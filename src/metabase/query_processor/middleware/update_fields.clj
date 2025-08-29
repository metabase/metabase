(ns metabase.query-processor.middleware.update-fields
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(mu/defn- update-fields* :- [:maybe ::lib.schema/stage]
  [query path stage]
  (when (and (= (:lib/type stage) :mbql.stage/mbql)
             (empty? (:breakout stage))
             (empty? (:aggregation stage)))
    (let [cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
      (assoc stage :fields (into []
                                 (comp (map lib/ref)
                                       (map (fn [a-ref]
                                              (cond-> a-ref
                                                ;; Any coercion or temporal bucketing will already have been done in
                                                ;; the subquery for the join itself. Mark the parent ref to make sure
                                                ;; it is not double-coerced, which leads to SQL errors.
                                                (and (lib.util/clause-of-type? a-ref :field)
                                                     (lib/current-join-alias a-ref))
                                                (lib/update-options assoc :qp/ignore-coercion true)))))
                                 cols)))))

(mu/defn update-fields :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query update-fields*))
