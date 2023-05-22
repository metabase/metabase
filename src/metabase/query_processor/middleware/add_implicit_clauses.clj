(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require
   [clojure.walk :as walk]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :as table]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Add Implicit Fields                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- table->sorted-fields*
  [table-id]
  (t2/select [Field :id :base_type :effective_type :coercion_strategy :semantic_type]
    :table_id        table-id
    :active          true
    :visibility_type [:not-in ["sensitive" "retired"]]
    :parent_id       nil
    {:order-by table/field-order-rule}))

(defn- table->sorted-fields
  "Return a sequence of all Fields for table that we'd normally include in the equivalent of a `SELECT *`."
  [table-id]
  (if (qp.store/initialized?)
    ;; cache duplicate calls to this function in the same QP run.
    (qp.store/cached-fn [::table-sorted-fields (u/the-id table-id)] #(table->sorted-fields* table-id))
    ;; if QP store is not initialized don't try to cache the value (this is mainly for the benefit of tests and code
    ;; that uses this outside of the normal QP execution context)
    (table->sorted-fields* table-id)))

(s/defn sorted-implicit-fields-for-table :- mbql.s/Fields
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in [[metabase.query-processor.sort]], for all the Fields in a given Table."
  [table-id :- su/IntGreaterThanZero]
  (let [fields (table->sorted-fields table-id)]
    (when (empty? fields)
      (throw (ex-info (tru "No fields found for table {0}." (pr-str (:name (qp.store/table table-id))))
                      {:table-id table-id
                       :type     qp.error-type/invalid-query})))
    (mapv
     (fn [field]
       ;; implicit datetime Fields get bucketing of `:default`. This is so other middleware doesn't try to give it
       ;; default bucketing of `:day`
       [:field (u/the-id field) (when (types/temporal-field? field)
                                  {:temporal-unit :default})])
     fields)))

(s/defn ^:private source-metadata->fields :- mbql.s/Fields
  "Get implicit Fields for a query with a `:source-query` that has `source-metadata`."
  [source-metadata :- (su/non-empty [mbql.s/SourceQueryMetadata])]
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

(s/defn ^:private should-add-implicit-fields?
  "Whether we should add implicit Fields to this query. True if all of the following are true:

  *  The query has either a `:source-table`, *or* a `:source-query` with `:source-metadata` for it
  *  The query has no breakouts
  *  The query has no aggregations"
  [{:keys        [fields source-table source-query source-metadata]
    breakouts    :breakout
    aggregations :aggregation} :- mbql.s/MBQLQuery]
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

(s/defn ^:private add-implicit-fields
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [{source-table-id :source-table, :keys [expressions source-metadata], :as inner-query}]
  (if-not (should-add-implicit-fields? inner-query)
    inner-query
    (let [fields      (if source-table-id
                        (sorted-implicit-fields-for-table source-table-id)
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
      (assoc inner-query :fields (vec (concat fields expressions))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Add Implicit Breakout Order Bys                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-implicit-breakout-order-by :- mbql.s/MBQLQuery
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [{breakouts :breakout, :as inner-query} :- mbql.s/MBQLQuery]
  ;; Add a new [:asc <breakout-field>] clause for each breakout. The cool thing is `add-order-by-clause` will
  ;; automatically ignore new ones that are reference Fields already in the order-by clause
  (reduce mbql.u/add-order-by-clause inner-query (for [breakout breakouts]
                                                   [:asc breakout])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn add-implicit-mbql-clauses
  "Add implicit clauses such as `:fields` and `:order-by` to an 'inner' MBQL query as needed."
  [form]
  (walk/postwalk
   (fn [form]
     ;; add implicit clauses to any 'inner query', except for joins themselves (we should still add implicit clauses
     ;; like `:fields` to source queries *inside* joins)
     (if (and (map? form)
              ((some-fn :source-table :source-query) form)
              (not (:condition form)))
       (-> form add-implicit-breakout-order-by add-implicit-fields)
       form))
   form))

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [{query-type :type, :as query}]
  (if (= query-type :native)
    query
    (update query :query add-implicit-mbql-clauses)))
