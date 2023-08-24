(ns metabase.qp.preprocess.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.qp.metadata-provider :as qp.metadata-provider]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- table->sorted-fields
  "Return a sequence of all Fields for table that we'd normally include in the equivalent of a `SELECT *`."
  [table-id]
  (->> (lib.metadata/fields (qp.metadata-provider/metadata-provider) table-id)
       (remove :parent-id)
       (sort-by (juxt :position (comp u/lower-case-en :name)))))

(mu/defn sorted-implicit-fields-for-table :- [:sequential {:min 1} :mbql.clause/field]
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in [[metabase.query-processor.sort]], for all the Fields in a given Table."
  [table-id :- ::lib.schema.id/table]
  (let [fields (table->sorted-fields table-id)]
    (when (empty? fields)
      (let [table (lib.metadata/table (qp.metadata-provider/metadata-provider) table-id)]
        (throw (ex-info (tru "No fields found for table {0}." (pr-str (:name table)))
                        {:table-id table-id
                         :type     qp.error-type/invalid-query}))))
    (mapv
     (fn [col]
       ;; implicit datetime Fields get bucketing of `:default`. This is so other middleware doesn't try to give it
       ;; default bucketing of `:day`
       (let [col (cond-> col
                   ; misnomer; this is for all temporal columns.
                   (lib.types.isa/date? col)
                   (lib.temporal-bucket/with-temporal-bucket :default))]
         (lib.ref/ref col)))
      fields)))

(mu/defn ^:private previous-stage-fields :- [:sequential {:min 1} :mbql.clause/field]
  [context]
  (let [query              (:query context)
        stages             (get-in context (cons :query (butlast (:path context))))
        query              (assoc query :stages stages)
        previous-stage-num (lib.util/previous-stage-number query (last (:path context)))]
    (assert (integer? previous-stage-num))
    (mapv
     lib.ref/ref
     (lib.metadata.calculation/returned-columns query previous-stage-num (lib.util/query-stage query previous-stage-num)))))

(mu/defn ^:private should-add-implicit-fields?
  "Whether we should add implicit Fields to this query. True if all of the following are true:

  *  The query has either a `:source-table`, *or* a `:source-query` with `:source-metadata` for it
  *  The query has no breakouts
  *  The query has no aggregations"
  [{:keys        [fields]
    breakouts    :breakout
    aggregations :aggregation} :- ::lib.schema/stage.mbql]
  (every? empty? [aggregations breakouts fields]))

(mu/defn ^:private add-implicit-fields
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [{source-table-id :source-table, :keys [expressions], :as stage} context]
  (if-not (should-add-implicit-fields? stage)
    stage
    (let [fields      (if source-table-id
                        (sorted-implicit-fields-for-table source-table-id)
                        (previous-stage-fields context))
          ;; generate a new expression ref clause for each expression defined in the query.
          expressions (for [[expression-name] expressions]
                        ;; TODO - we need to wrap this in `u/qualified-name` because `:expressions` uses
                        ;; keywords as keys. We can remove this call once we fix that.
                        [:expression (u/qualified-name expression-name)])]
      ;; if the Table has no Fields, throw an Exception, because there is no way for us to proceed
      (when-not (seq fields)
        (let [table (lib.metadata/table (qp.metadata-provider/metadata-provider) source-table-id)]
          (throw (ex-info (tru "Table ''{0}'' has no Fields associated with it." (:name table))
                          {:type qp.error-type/invalid-query}))))
      ;; add the fields & expressions under the `:fields` clause
      (assoc stage :fields (vec (concat fields expressions))))))

(mu/defn ^:private add-implicit-breakout-order-by :- ::lib.schema/stage.mbql
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [{breakouts :breakout, :as stage} :- ::lib.schema/stage.mbql]
  ;; Add a new [:asc <breakout-field>] clause for each breakout. The cool thing is `add-order-by-clause` will
  ;; automatically ignore new ones that are reference Fields already in the order-by clause
  (transduce
   (map (fn [breakout]
          (lib.order-by/order-by-clause breakout :asc)))
   (completing mbql.u/add-order-by-clause)
   stage
   breakouts))

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [stage context]
  (if (= (:lib/type stage) :mbql.stage/native)
    stage
    (-> stage add-implicit-breakout-order-by (add-implicit-fields context))))

(defn add-implicit-clauses-middleware
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [what]
  (when (= what :lib.walk/stage.post)
    #'add-implicit-clauses))
