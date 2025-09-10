(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn- should-add-implicit-fields?
  "Whether we should add implicit Fields to this query. True if all of the following are true:

  *  The query has either a `:source-table`, *or* a `:source-query` with `:source-metadata` for it
  *  The query has no breakouts
  *  The query has no aggregations"
  [{:keys        [fields]
    breakouts    :breakout
    aggregations :aggregation, :as stage} :- ::lib.schema/stage]
  (and (= (:lib/type stage) :mbql.stage/mbql)
       (every? empty? [aggregations breakouts fields])))

(mu/defn- add-implicit-fields :- [:maybe ::lib.schema/stage]
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [query                                      :- ::lib.schema/query
   path                                       :- ::lib.walk/path
   {source-table-id :source-table, :as stage} :- ::lib.schema/stage]
  (when (should-add-implicit-fields? stage)
    (let [cols        (if source-table-id
                        (lib/returned-columns query (lib.metadata/table query source-table-id))
                        (for [col (lib.walk/apply-f-for-stage-at-path
                                   ;; TODO -- include remaps? or no?
                                   lib/returned-columns
                                   query
                                   (lib.walk/previous-path path))]
                          (lib/update-keys-for-col-from-previous-stage col)))
          ;; generate a new expression ref clause for each expression defined in the query.
          expressions (lib.walk/apply-f-for-stage-at-path lib/expressions-metadata query path)]
      ;; if the Table has no Fields, throw an Exception, because there is no way for us to proceed
      (when-not (seq cols)
        (throw (ex-info (tru "Table ''{0}'' has no Fields associated with it."
                             (:name (lib.metadata/table query source-table-id)))
                        {:type qp.error-type/invalid-query})))
      ;; add the fields & expressions under the `:fields` clause
      (letfn [(updated-stage [query stage-number]
                (-> (lib/with-fields query stage-number (concat cols expressions))
                    (lib/query-stage stage-number)))]
        (lib.walk/apply-f-for-stage-at-path updated-stage (assoc-in query path stage) path)))))

(defn- has-window-function-aggregations? [stage]
  (or (lib.util.match/match (mapcat stage [:aggregation :expressions])
        #{:cum-sum :cum-count :offset}
        true)
      ;; FIXME
      (when-let [source-query (:source-query stage)]
        (has-window-function-aggregations? source-query))))

(mu/defn- add-implicit-breakout-order-by :- [:maybe ::lib.schema/stage]
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (when-not (has-window-function-aggregations? stage)
    (when-let [breakouts (not-empty (:breakout stage))]
      (letfn [(updated-stage [query stage-number]
                (-> (reduce (fn [query breakout]
                              (lib/order-by query stage-number (lib/fresh-uuids breakout) :asc))
                            query
                            breakouts)
                    (lib/query-stage stage-number)))]
        (lib.walk/apply-f-for-stage-at-path updated-stage (assoc-in query path stage) path)))))

(mu/defn add-implicit-clauses :- ::lib.schema/query
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [query :- ::lib.schema/query]
  (-> query
      (lib.walk/walk-stages add-implicit-breakout-order-by)
      (lib.walk/walk-stages add-implicit-fields)))
