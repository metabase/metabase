(ns metabase.query-processor.util.transformations.nest-cumulative-aggregations-in-expressions
  (:require
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.util.transformations.common :as qp.transformations.common]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defn- expression-containing-cumulative-aggregation?
  [x]
  (and
   (vector? x)
   (let [[tag _opts & args :as _aggregation] x]
     (when (#{:+ :- :/ :*} tag)
       (lib.util.match/match-one args
         #{:cum-sum :cum-count})))))

(defn- has-cumulative-aggregations-inside-expressions? [stage]
  (lib.util.match/match-one (:aggregation stage)
    expression-containing-cumulative-aggregation?))

(mr/def ::unrolled-info
  [:map
   ;; aggregations that should go in the new first stage.
   [:first-stage ::lib.schema.aggregation/aggregations]
   ;; expressions that should go in the new second stage.
   [:second-stage {:optional true} [:maybe ::lib.schema.expression/expressions]]])

(mu/defn ^:private unrolled-aggregation :- ::unrolled-info
  [[ag-type opts & args :as aggregation] :- ::lib.schema.aggregation/aggregation
   returned-columns                      :- [:sequential ::lib.schema.metadata/column]]
  (or (when (expression-containing-cumulative-aggregation? aggregation)
        (let [unwound-args (for [arg args]
                             (if (vector? arg)
                               (lib.options/update-options arg assoc :name (str (gensym "arg_")))
                               arg))]
          {:first-stage  (filter vector? unwound-args)
           :second-stage [(let [ag-metadata (m/find-first #(= (:lib/source-uuid %) (:lib/uuid opts))
                                                          returned-columns)
                                ag-name     (or (:lib/desired-column-alias ag-metadata)
                                                (str (gensym "expression_")))
                                opts        (assoc opts
                                                   :name                ag-name
                                                   :lib/expression-name ag-name
                                                   ;; we know that the arithmetic expressions all return some sort of
                                                   ;; Number.
                                                   :base-type           :type/Number
                                                   :effective-type      :type/Number)]
                            (into [ag-type opts]
                                  (map (fn [arg]
                                         (if (vector? arg)
                                           (let [[_tag opts] arg]
                                             [:field
                                              (-> (dissoc opts :name)
                                                  (assoc :lib/uuid (str (random-uuid))
                                                     ;; cumulative count and cumulative sum always return a Number...
                                                     ;; actually Cumulative Count always returns an INTEGER, who cares
                                                     ;; tho
                                                         :base-type     :type/Number
                                                         :effective-type :type/Number))
                                              (:name opts)])
                                           arg)))
                                  unwound-args))]}))
      {:first-stage [aggregation]}))

(mu/defn ^:private unrolled-info :- ::unrolled-info
  [aggregations     :- ::lib.schema.aggregation/aggregations
   returned-columns :- [:sequential ::lib.schema.metadata/column]]
  (reduce
   (fn [acc aggregation]
     (let [unrolled (unrolled-aggregation aggregation returned-columns)]
       {:first-stage  (into (vec (:first-stage acc)) (:first-stage unrolled))
        :second-stage (into (vec (:second-stage acc)) (:second-stage unrolled))}))
   {:first-stage [], :second-stage []}
   aggregations))

(mu/defn ^:private new-first-stage :- ::lib.schema/stage
  [stage                                     :- ::lib.schema/stage.mbql
   {:keys [first-stage], :as _unrolled-info} :- ::unrolled-info]
  (assoc stage :aggregation first-stage))

(mu/defn ^:private new-second-stage :- ::lib.schema/stage
  [_stage                                     :- ::lib.schema/stage.mbql
   {:keys [second-stage], :as _unrolled-info} :- ::unrolled-info
   returned-columns                           :- [:sequential ::lib.schema.metadata/column]]
  {:lib/type :mbql.stage/mbql
   :fields   (into
              []
              cat
              [(for [col returned-columns
                     :when (not (::contains-cumulative-ag? col))]
                 (lib.ref/ref (qp.transformations.common/update-aggregation-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage col)))
               (for [[_tag opts :as _expression] second-stage]
                 [:expression
                  {:lib/uuid       (str (random-uuid))
                   :base-type      :type/Number
                   :effective-type :type/Number}
                  (:lib/expression-name opts)])])
   :expressions second-stage})

(mu/defn ^:private new-stages :- [:sequential {:min 2, :max 2} ::lib.schema/stage.mbql]
  [stage            :- ::lib.schema/stage.mbql
   returned-columns :- [:sequential ::lib.schema.metadata/column]]
  (let [unrolled-info (unrolled-info (:aggregation stage) returned-columns)]
    [(new-first-stage stage unrolled-info)
     (new-second-stage stage unrolled-info returned-columns)]))

(mu/defn ^:private returned-columns :- [:sequential ::lib.schema.metadata/column]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path]
  (lib.walk/apply-f-for-stage-at-path
   (fn [query stage-number]
     (for [col (lib/returned-columns query stage-number)
           :let [contains-cumulative-ag? (when (= (:lib/source col) :source/aggregations)
                                           (let [ag-clause (lib.aggregation/resolve-aggregation query stage-number (:lib/source-uuid col))]
                                             (expression-containing-cumulative-aggregation? ag-clause)))]]
       (assoc col ::contains-cumulative-ag? contains-cumulative-ag?)))
   query
   path))

(mu/defn ^:private nest-cumulative-aggregations-in-expressions* :- [:maybe [:sequential {:min 2} ::lib.schema/stage]]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (when (has-cumulative-aggregations-inside-expressions? stage)
    (let [returned-columns (returned-columns query path)]
      (new-stages stage returned-columns))))

(mu/defn nest-cumulative-aggregations-in-expressions :- ::lib.schema/query
  "Replace a stage like

    {:aggregation [[:+ {} [:cum-sum {} x] [:cum-count {} y]]]}

  with multiple stages like

    [{:aggregation [[:cum-sum {:name \"arg_1\"} x]
                    [:cum-count {:name \"arg_2\"} y]]}
     {:expressions [[:+ {}
                     [:field {} \"arg_1\"]
                     [:field {} \"arg_2\"]]]}]"
  [query :- ::lib.schema/query]
  (let [query' (lib.walk/walk-stages query nest-cumulative-aggregations-in-expressions*)]
    (if (= query query')
      query
      (recur query'))))
