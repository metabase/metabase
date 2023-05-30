(ns metabase.lib.remove-replace
  (:require
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.util.malli :as mu]))

(defn- stage-paths
  [query stage-number]
  (let [join-indices (range (count (lib.join/joins query stage-number)))
        join-condition-paths (for [idx join-indices]
                               [:joins idx :conditions])
        join-field-paths (for [idx join-indices]
                           [:joins idx :fields])
        expr-paths (for [[expr-name] (lib.expression/expressions query stage-number)]
                     [:expressions expr-name])]
    (concat [[:order-by] [:breakout] [:filters] [:fields] [:aggregation]]
            expr-paths
            join-field-paths
            join-condition-paths)))

(declare remove-local-references)
(declare remove-stage-references)

(defn- update-breakout-order-by
  [query stage-number [target-op {:keys [temporal-unit binning]} target-ref-id] new-binning new-temporal-unit]
  (if-let [[order-by-idx _] (->> (lib.util/query-stage query stage-number)
                                 :order-by
                                 m/indexed
                                 (m/find-first (fn [[_idx [_dir _ ordered-clause]]]
                                                 (and (= (first ordered-clause) target-op)
                                                      (= (:temporal-unit (second ordered-clause)) temporal-unit)
                                                      (= (:binning (second ordered-clause)) binning)
                                                      (= (last ordered-clause) target-ref-id)))))]

    (lib.util/update-query-stage
      query stage-number
      update-in [:order-by order-by-idx 2 1]
      (comp #(m/remove-vals nil? %) merge)
      {:temporal-unit new-temporal-unit
       :binning new-binning})
    query))

(defn- remove-replace-location
  [query stage-number unmodified-query-for-stage location target-clause remove-replace-fn]
  (let [result (lib.util/update-query-stage query stage-number
                                             remove-replace-fn location target-clause)
        target-uuid (lib.util/clause-uuid target-clause)]
    (if (not= query result)
      (mbql.match/match-one location
        [:expressions expr-name]
        (-> result
            (remove-local-references
              stage-number
              unmodified-query-for-stage
              :expression
              expr-name)
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid))

        [:aggregation]
        (-> result
            (remove-local-references
              stage-number
              unmodified-query-for-stage
              :aggregation
              target-uuid)
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid))

        #_{:clj-kondo/ignore [:invalid-arity]}
        (:or
          [:breakout]
          [:fields]
          [:joins _ :fields])
        (remove-stage-references result stage-number unmodified-query-for-stage target-uuid)

        _
        result)
      result)))

(defn- remove-local-references [query stage-number unmodified-query-for-stage target-op target-ref-id]
  (let [stage (lib.util/query-stage query stage-number)
        to-remove (mapcat
                    (fn [location]
                      (when-let [sub-loc (get-in stage location)]
                        (let [clauses (if (lib.util/clause-uuid sub-loc)
                                        [sub-loc]
                                        sub-loc)]
                          (->> clauses
                               (keep #(mbql.match/match-one sub-loc
                                        [target-op _ target-ref-id] [location %]))))))
                    (stage-paths query stage-number))]
    (reduce
      (fn [query [location target-clause]]
        (remove-replace-location query stage-number unmodified-query-for-stage location target-clause lib.util/remove-clause))
      query
      to-remove)))

(defn- remove-stage-references
  [query previous-stage-number unmodified-query-for-stage target-uuid]
  (if-let [stage-number (lib.util/next-stage-number unmodified-query-for-stage previous-stage-number)]
    (let [stage (lib.util/query-stage unmodified-query-for-stage stage-number)
          target-ref-id (->> (lib.metadata.calculation/visible-columns unmodified-query-for-stage stage-number stage)
                             (some (fn [{:keys [lib/source lib/source-uuid] :as column}]
                                     (when (and (= :source/previous-stage source) (= target-uuid source-uuid))
                                       (:lib/desired-column-alias column)))))]
      (if target-ref-id
        ;; We are moving to the next stage, so pass the current query as the unmodified-query-for-stage
        (remove-local-references query stage-number query :field target-ref-id)
        query))
    query))

(defn- remove-replace* [query stage-number target-clause remove-or-replace replacement]
  (binding [mu/*enforce* false]
    (let [target-clause (lib.common/->op-arg query stage-number target-clause)
          stage (lib.util/query-stage query stage-number)
          location (m/find-first
                     (fn [possible-location]
                       (when-let [sub-loc (get-in stage possible-location)]
                         (let [clauses (if (lib.util/clause? sub-loc)
                                         [sub-loc]
                                         sub-loc)
                               target-uuid (lib.util/clause-uuid target-clause)]
                           (when (some (comp #{target-uuid} :lib/uuid second) clauses)
                             possible-location))))
                     (stage-paths query stage-number))
          replace? (= :replace remove-or-replace)
          replacement-clause (when replace?
                               (lib.common/->op-arg query stage-number replacement))
          remove-replace-fn (if replace?
                              #(lib.util/replace-clause %1 %2 %3 replacement-clause)
                              lib.util/remove-clause)
          query (cond-> query
                  ;; Keep order in sync by if we are just changing binning or bucketing
                  (and replace?
                       (= [:breakout] location)
                       (and (= (first target-clause)
                               (first replacement-clause))
                            (= (last target-clause)
                               (last replacement-clause))))
                  (update-breakout-order-by
                    stage-number
                    target-clause
                    (:binning (second replacement-clause))
                    (:temporal-unit (second replacement-clause))))]
      (if location
        (remove-replace-location query stage-number query location target-clause remove-replace-fn)
        query))))

(mu/defn remove-clause :- :metabase.lib.schema/query
  "Removes the `target-clause` in the filter of the `query`."
  ([query :- :metabase.lib.schema/query
    target-clause]
   (remove-clause query -1 target-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause]
   (remove-replace* query stage-number target-clause :remove nil)))

(mu/defn replace-clause :- :metabase.lib.schema/query
  "Replaces the `target-clause` with `new-clause` in the `query` stage."
  ([query :- :metabase.lib.schema/query
    target-clause
    new-clause]
   (replace-clause query -1 target-clause new-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause
    new-clause]
   (remove-replace* query stage-number target-clause :replace new-clause)))
