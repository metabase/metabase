(ns metabase.query-processor.middleware.add-implicit-clauses
  "Middlware for adding an implicit `:fields` and `:order-by` clauses to certain queries."
  (:require [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor
             [interface :as qp.i]
             [store :as qp.store]]
            [metabase.util
             [i18n :refer [trs tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Add Implicit Fields                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; this is a fn because we don't want to call mdb/isa before type hierarchy is loaded!
(defn- default-sort-rules []
  [ ;; sort first by position,
   [:position :asc]
   ;; or if that's the same, sort PKs first, followed by names, followed by everything else
   [(hsql/call :case
      (mdb/isa :special_type :type/PK)   0
      (mdb/isa :special_type :type/Name) 1
      :else                              2)
    :asc]
   ;; finally, sort by name (case-insensitive)
   [:%lower.name :asc]])

(defn- table->sorted-fields [table-or-id]
  (db/select [Field :id :base_type :special_type]
    :table_id        (u/get-id table-or-id)
    :active          true
    :visibility_type [:not-in ["sensitive" "retired"]]
    :parent_id       nil
    ;; I suppose if we wanted to we could make the `order-by` rules swappable with something other set of rules
    {:order-by (default-sort-rules)}))

(s/defn sorted-implicit-fields-for-table :- mbql.s/Fields
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in `metabase.query-processor.sort`, for all the Fields in a given Table."
  [table-id :- su/IntGreaterThanZero]
  (for [field (table->sorted-fields table-id)]
    (if (mbql.u/datetime-field? field)
      ;; implicit datetime Fields get bucketing of `:default`. This is so other middleware doesn't try to give it
      ;; default bucketing of `:day`
      [:datetime-field [:field-id (u/get-id field)] :default]
      [:field-id (u/get-id field)])))

(s/defn ^:private source-metadata->fields :- mbql.s/Fields
  "Get implicit Fields for a query with a `:source-query` that has `source-metadata`."
  [source-metadata :- (su/non-empty [mbql.s/SourceQueryMetadata])]
  (for [{field-name :name, base-type :base_type} source-metadata]
    [:field-literal field-name base-type]))


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
  (when (and source-query (empty? source-metadata))
    (when-not qp.i/*disable-qp-logging*
      (log/warn
       (trs "Warning: cannot determine fields for an explicit `source-query` unless you also include `source-metadata`."))))
  ;; Determine whether we can add the implicit `:fields`
  (and (or source-table
           (and source-query (seq source-metadata)))
       (every? empty? [aggregations breakouts fields])))

(s/defn ^:private add-implicit-fields :- mbql.s/MBQLQuery
  "For MBQL queries with no aggregation, add a `:fields` key containing all Fields in the source Table as well as any
  expressions definied in the query."
  [{source-table-id :source-table, :keys [expressions source-metadata], :as inner-query} :- mbql.s/MBQLQuery]
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
        (throw (Exception. (tru "Table ''{0}'' has no Fields associated with it."
                                (:name (qp.store/table source-table-id))))))
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

(s/defn add-implicit-mbql-clauses :- mbql.s/MBQLQuery
  "Add implicit clauses such as `:fields` and `:order-by` to an 'inner' MBQL query as needed."
  [{:keys [source-query], :as inner-query} :- mbql.s/MBQLQuery]
  (let [mbql-source-query? (and source-query (not (:native source-query)))
        inner-query        (-> inner-query add-implicit-breakout-order-by add-implicit-fields)]
    (if mbql-source-query?
      ;; if query has an MBQL source query recursively add implicit clauses to that too as needed
      (update inner-query :source-query add-implicit-mbql-clauses)
      ;; otherwise we're done
      inner-query)))

(defn- maybe-add-implicit-clauses
  [{query-type :type, :as query}]
  (if (= query-type :native)
    query
    (update query :query add-implicit-mbql-clauses)))

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [qp]
  (comp qp maybe-add-implicit-clauses))
