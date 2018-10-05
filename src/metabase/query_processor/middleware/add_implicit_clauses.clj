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
            [metabase.query-processor.store :as qp.store]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan.db :as db]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Add Implicit Fields                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- datetime-field? [{:keys [base_type special_type]}]
  (or (isa? base_type :type/DateTime)
      (isa? special_type :type/DateTime)))

(s/defn ^:private sorted-implicit-fields-for-table :- [mbql.s/Field]
  "For use when adding implicit Field IDs to a query. Return a sequence of field clauses, sorted by the rules listed
  in `metabase.query-processor.sort`, for all the Fields in a given Table."
  [table-id :- su/IntGreaterThanZero]
  (for [field (db/select [Field :id :base_type :special_type]
                :table_id        table-id
                :active          true
                :visibility_type [:not-in ["sensitive" "retired"]]
                :parent_id       nil
                {:order-by [
                            ;; we can skip 1-3 because queries w/ implicit Field IDs queries won't have
                            ;; breakouts or fields clauses, and aggregation isn't an actual Field in the DB
                            ;; anyway
                            ;;
                            ;; 4A. position
                            [:position :asc]
                            ;; 4B. special_type: :type/PK, :type/Name, then others
                            [(hsql/call :case
                               (mdb/isa :special_type :type/PK)   0
                               (mdb/isa :special_type :type/Name) 1
                               :else                              2)
                             :asc]
                            ;; 4C. name
                            [:%lower.name :asc]]})]
    (if (datetime-field? field)
      ;; implicit datetime Fields get bucketing of `:default`. This is so other middleware doesn't try to give it
      ;; default bucketing of `:day`
      [:datetime-field [:field-id (u/get-id field)] :default]
      [:field-id (u/get-id field)])))


(s/defn ^:private should-add-implicit-fields?
  [{:keys [fields breakout source-table], aggregations :aggregation} :- mbql.s/MBQLQuery]
  ;; if query is using another query as its source then there will be no table to add nested fields for
  (and source-table
       (not (or (seq aggregations)
                (seq breakout)
                (seq fields)))))

(s/defn ^:private add-implicit-fields :- mbql.s/Query
  "For MBQL queries with no aggregation, add a `:fields` containing all Fields in the source Table as well as any
  expressions definied in the query."
  [{{source-table-id :source-table, :as inner-query} :query, :as query} :- mbql.s/Query]
  (if-not (should-add-implicit-fields? inner-query)
    query
    ;; add a `fields-is-implict` key to the query, which is used to determine how Fields are sorted in the `sort`
    ;; middleware.
    (let [inner-query (assoc inner-query :fields-is-implicit true)
          fields      (sorted-implicit-fields-for-table source-table-id)
          ;; generate a new expression ref clause for each expression defined in the query.
          expressions (for [[expression-name] (:expressions inner-query)]
                        ;; TODO - we need to wrap this in `u/keyword->qualified-name` because `:expressions` uses
                        ;; keywords as keys. We can remove this call once we fix that.
                        [:expression (u/keyword->qualified-name expression-name)])]
      ;; if the Table has no Fields, log a warning.
      (when-not (seq fields)
        (log/warn (trs "Table ''{0}'' has no Fields associated with it." (:name (qp.store/table source-table-id)))))
      ;; add the fields & expressions under the `:fields` clause
      (assoc-in query [:query :fields] (vec (concat fields expressions))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                        Add Implicit Breakout Order Bys                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-implicit-breakout-order-by :- mbql.s/Query
  "Fields specified in `breakout` should add an implicit ascending `order-by` subclause *unless* that Field is already
  *explicitly* referenced in `order-by`."
  [{{breakouts :breakout} :query, :as query} :- mbql.s/Query]
  ;; Add a new [:asc <breakout-field>] clause for each breakout. The cool thing is `add-order-by-clause` will
  ;; automatically ignore new ones that are reference Fields already in the order-by clause
  (reduce mbql.u/add-order-by-clause query (for [breakout breakouts]
                                             [:asc breakout])))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Middleware                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private add-implicit-mbql-clauses :- mbql.s/Query
  [{{:keys [source-query]} :query, :as query} :- mbql.s/Query]
  (cond-> (-> query add-implicit-breakout-order-by add-implicit-fields)
    ;; if query has an MBQL source query recursively add implicit clauses to that too as needed
    (and source-query (not (:native source-query)))
    (update-in [:query :source-query] (fn [source-query]
                                        (:query (add-implicit-mbql-clauses
                                                 (assoc query :query source-query)))))))

(defn- maybe-add-implicit-clauses
  [{query-type :type, :as query}]
  (cond-> query
    (= query-type :query) add-implicit-mbql-clauses))

(defn add-implicit-clauses
  "Add an implicit `fields` clause to queries with no `:aggregation`, `breakout`, or explicit `:fields` clauses.
   Add implicit `:order-by` clauses for fields specified in a `:breakout`."
  [qp]
  (comp qp maybe-add-implicit-clauses))
