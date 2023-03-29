(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.lib.convert :as lib.convert]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Add Implicit Fields                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table->sorted-fields
  "Return a sequence of all Fields for table that we'd normally include in the equivalent of a `SELECT *`."
  [query table-id]
  (if (qp.store/initialized?)
    ;; cache duplicate calls to this function in the same QP run.
    (qp.store/cached-fn [::table-sorted-fields (u/the-id table-id)]
      #(lib.stage/source-table-default-fields query table-id))
    ;; if QP store is not initialized don't try to cache the value (this is mainly for the benefit of tests and code
    ;; that uses this outside of the normal QP execution context)
    (lib.stage/source-table-default-fields query table-id)))

(mu/defn sorted-implicit-fields-for-table :- ::lib.schema/fields
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in [[metabase.query-processor.sort]], for all the Fields in a given Table."
  [query    :- ::lib.schema/query
   table-id :- ::lib.schema.id/table]
  (let [fields (table->sorted-fields query table-id)]
    (when (empty? fields)
      (throw (ex-info (tru "No fields found for table {0}." (pr-str (:name (qp.store/table table-id))))
                      {:table-id table-id
                       :type     qp.error-type/invalid-query})))
    (mapv (fn [field]
            [:field {:base-type (:base_type field), :lib/uuid "00000000-0000-0000-0000-000000000000"} (:id field)])
          fields)))

(mu/defn ^:private source-metadata->fields :- ::lib.schema/fields
  "Get implicit Fields for a query with a `:source-query` that has `source-metadata`."
  [source-metadata :- [:sequential {:min 1} ::lib.metadata/stage-metadata]]
  (distinct
   (for [{field-name :name, base-type :base_type, field-id :id, field-ref :field_ref} source-metadata]
     ;; return field-ref directly if it's a `:field` clause already. It might include important info such as
     ;; `:join-alias` or `:source-field`. Remove binning/temporal bucketing info. The Field should already be getting
     ;; bucketed in the source query; don't need to apply bucketing again in the parent query.
     (or (some-> (mbql.u/match-one field-ref :field)
                 (mbql.u/update-field-options dissoc :binning :temporal-unit))
         ;; otherwise construct a field reference that can be used to refer to this Field.
         (if field-id
           ;; If we have a Field ID, return a `:field` (id) clause
           [:field field-id nil]
           ;; otherwise return a `:field` (name) clause, e.g. for a Field that's the result of an aggregation or
           ;; expression
           [:field field-name {:base-type base-type}])))))

(mu/defn ^:private should-add-implicit-fields?
  "Whether we should add implicit Fields to this query. True if all of the following are true:

  *  The query has either a `:source-table`, *or* a `:source-query` with `:source-metadata` for it
  *  The query has no breakouts
  *  The query has no aggregations"
  [{:keys        [fields source-table source-query source-metadata]
    breakouts    :breakout
    aggregations :aggregation} :- ::lib.schema/stage.mbql]
  ;; if someone is trying to include an explicit `source-query` but isn't specifiying `source-metadata` warn that
  ;; there's nothing we can do to help them
  (when (and source-query
             (empty? source-metadata)
             (qp.store/initialized?))
    ;; by 'caching' this result, this log message will only be shown once for a given QP run.
    (qp.store/cached [::should-add-implicit-fields-warning]
      (log/warn (str (trs "Warning: cannot determine fields for an explicit `source-query` unless you also include `source-metadata`.")
                     \newline
                     (trs "Query: {0}" (u/pprint-to-str source-query))))))
  ;; Determine whether we can add the implicit `:fields`
  (and (or source-table
           (and source-query (seq source-metadata)))
       (every? empty? [aggregations breakouts fields])))

(mu/defn ^:private add-implicit-fields
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [query
   {source-table-id :source-table, :keys [expressions source-metadata], :as stage}]
  (if-not (should-add-implicit-fields? stage)
    stage
    (let [fields      (if source-table-id
                        (sorted-implicit-fields-for-table query source-table-id)
                        (source-metadata->fields source-metadata))
          ;; generate a new expression ref clause for each expression defined in the query.
          expressions (for [[expression-name] expressions]
                        ;; TODO - we need to wrap this in `u/qualified-name` because `:expressions` uses
                        ;; keywords as keys. We can remove this call once we fix that.
                        [:expression (u/qualified-name expression-name)])]
      ;; if the Table has no Fields, throw an Exception, because there is no way for us to proceed
      (when-not (seq fields)
        (throw (ex-info (tru "Table ''{0}'' has no Fields associated with it." (:name (qp.store/table source-table-id)))
                        {:type qp.error-type/invalid-query})))
      ;; add the fields & expressions under the `:fields` clause
      (assoc stage :fields (vec (concat fields expressions))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Add Implicit Breakout Order Bys                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn ^:private add-implicit-breakout-order-by :- ::lib.schema/stage.mbql
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [{breakouts :breakout, :as stage} :- ::lib.schema/stage.mbql]
  ;; Add a new [:asc <breakout-field>] clause for each breakout. The cool thing is `add-order-by-clause` will
  ;; automatically ignore new ones that are reference Fields already in the order-by clause
  (reduce mbql.u/add-order-by-clause stage (for [breakout breakouts]
                                             [:asc breakout])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [query]
  ;; add implicit clauses to any 'inner query', except for joins themselves (we should still add implicit clauses
  ;; like `:fields` to source queries *inside* joins)
  (lib.util/update-stages
   query
   (fn [query _stage-number stage]
     (when (= (:lib/type stage) :mbql.stage/mbql)
       (->> stage
            add-implicit-breakout-order-by
            (add-implicit-fields query))))))
