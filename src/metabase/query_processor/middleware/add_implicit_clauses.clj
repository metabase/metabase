(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.lib.expression :as lib.expression]))

(mu/defn ^:private table->sorted-fields :- [:sequential ::lib.schema.metadata/column]
  "Return a sequence of all Fields for table that we'd normally include in the equivalent of a `SELECT *`."
  [table-id :- ::lib.schema.id/table]
  (->> (lib.metadata/fields (qp.store/metadata-provider) table-id)
       (remove :parent-id)
       (remove #(#{:sensitive :retired} (:visibility-type %)))
       (sort-by (juxt :position (comp u/lower-case-en :name)))))

(mu/defn sorted-implicit-fields-for-table :- ::lib.schema/fields
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in [[metabase.query-processor.sort]], for all the Fields in a given Table."
  [table-id :- ms/PositiveInt]
  (let [fields (table->sorted-fields table-id)]
    (when (empty? fields)
      (throw (ex-info (tru "No fields found for table {0}." (pr-str (:name (lib.metadata/table (qp.store/metadata-provider) table-id))))
                      {:table-id table-id
                       :type     qp.error-type/invalid-query})))
    (into []
          (comp (map (fn [field]
                       ;; implicit datetime Fields get bucketing of `:default`. This is so other middleware doesn't try
                       ;; to give it default bucketing of `:day`
                       (if (lib.types.isa/temporal? field)
                         (lib/with-temporal-bucket field :default)
                         field)))
                (map lib.ref/ref))
          fields)))

(mu/defn ^:private source-metadata->fields :- ::lib.schema/fields
  "Get implicit Fields for a query with a `:source-query` that has `source-metadata`."
  [source-metadata :- [:sequential {:min 1} ::lib.schema.metadata/column]]
  (distinct
   (for [{field-name :name, base-type :base_type, field-id :id, [ref-type :as field-ref] :field_ref} source-metadata]
     ;; return field-ref directly if it's a `:field` clause already. It might include important info such as
     ;; `:join-alias` or `:source-field`. Remove binning/temporal bucketing info. The Field should already be getting
     ;; bucketed in the source query; don't need to apply bucketing again in the parent query.
     (or (some-> (mbql.u/match-one field-ref :field)
                 (mbql.u/update-field-options dissoc :binning :temporal-unit))
         ;; otherwise construct a field reference that can be used to refer to this Field.
         ;; Force string id field if expression contains just field. See issue #28451.
         (if (and (not= ref-type :expression)
                  field-id)
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
  [query        :- ::lib.schema/query
   stage-number :- :int]
  ;; if someone is trying to include an explicit `source-query` but isn't specifiying `source-metadata` warn that
  ;; there's nothing we can do to help them
  (let [previous-stage-number   (lib.util/previous-stage-number query stage-number)
        previous-stage-metadata (when previous-stage-number
                                  (lib.stage/previous-stage-metadata query stage-number identity))]
    (when (and previous-stage-number
           (empty? previous-stage-metadata))
      ;; by 'caching' this result, this log message will only be shown once for a given QP run.
      (qp.store/cached [::should-add-implicit-fields-warning]
        (log/warn (str "Warning: cannot determine fields for an query stage following a native stage unless you also include source metadata."
                       \newline
                       "Previous stage: %s" (u/pprint-to-str
                                             (lib.util/query-stage query
                                                                   (lib.util/previous-stage-number query stage-number)))))))
    ;; Determine whether we can add the implicit `:fields`
    (let [stage (lib.util/query-stage query stage-number)]
      (and (or (:source-table stage)
               (seq previous-stage-metadata))
           (every? empty?
                   [(lib/aggregations query stage-number)
                    (lib/breakouts query stage-number)
                    (lib/fields query stage-number)])))))

(mu/defn ^:private add-implicit-fields :- ::lib.schema/query
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (if-not (should-add-implicit-fields? query stage-number)
    query
    (let [source-table-id (:source-table (lib.util/query-stage query stage-number))
          fields          (if source-table-id
                        (sorted-implicit-fields-for-table source-table-id)
                        (when-let [previous-stage-metadata (lib.stage/previous-stage-metadata query stage-number identity)]
                          (source-metadata->fields previous-stage-metadata)))
          ;; generate a new expression ref clause for each expression defined in the query.
          expressions     (for [expression (lib/expressions-metadata query stage-number)]
                            (lib/ref expression))]
      ;; if the Table has no Fields, throw an Exception, because there is no way for us to proceed
      (when-not (seq fields)
        (throw (ex-info (tru "Table ''{0}'' has no Fields associated with it."
                             (:name (lib.metadata/table (qp.store/metadata-provider) source-table-id)))
                        {:type qp.error-type/invalid-query})))
      ;; add the fields & expressions under the `:fields` clause
      (lib/with-fields query stage-number (vec (concat fields expressions))))))

(mu/defn ^:private add-implicit-breakout-order-by :- ::lib.schema/query
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (reduce
   (fn [query breakout]
     (lib/order-by query stage-number breakout :asc))
   query
   (lib/breakouts-metadata query stage-number)))

(defn add-implicit-mbql-clauses
  "Add implicit clauses such as `:fields` and `:order-by` to an 'inner' MBQL query as needed."
  [query]
  ;; add implicit clauses to any 'inner query', except for joins themselves (we should still add implicit clauses
  ;; like `:fields` to source queries *inside* joins)
  (lib.walk/walk-only
   #{:mbql.stage/mbql}
   query
   (fn [_mbql-stage context]
     (let [query        (:query context)
           stage-number (last (:path context))]
       (-> query
           (add-implicit-breakout-order-by stage-number)
           (add-implicit-fields stage-number)
           (lib.util/query-stage stage-number))))))
