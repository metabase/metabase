(ns metabase.db.metadata-queries
  "Predefined MBQL queries for getting metadata about an external database."
  (:require [clojure.tools.logging :as log]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.interface :as qpi]
            [metabase.sync.interface :as si]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- qp-query [db-id mbql-query]
  {:pre [(integer? db-id)]}
  (-> (binding [qpi/*disable-qp-logging* true]
        (qp/process-query
         {:type     :query
          :database db-id
          :query    mbql-query}))
      :data
      :rows))

(defn- field-query [{table-id :table_id} mbql-query]
  {:pre [(integer? table-id)]}
  (qp-query (db/select-one-field :db_id Table, :id table-id)
            ;; this seeming useless `merge` statement IS in fact doing something important. `ql/query` is a threading
            ;; macro for building queries. Do not remove
            (assoc mbql-query :source-table table-id)))

(defn table-row-count
  "Fetch the row count of `table` via the query processor."
  [table]
  {:pre  [(map? table)]
   :post [(integer? %)]}
  (let [results (qp-query (:db_id table) {:source-table (u/get-id table)
                                          :aggregation  [[:count]]})]
    (try (-> results first first long)
         (catch Throwable e
           (log/error "Error fetching table row count. Query returned:\n"
                      (u/pprint-to-str results))
           (throw e)))))

(def ^:private ^Integer absolute-max-distinct-values-limit
  "The absolute maximum number of results to return for a `field-distinct-values` query. Normally Fields with 100 or
  less values (at the time of this writing) get marked as `auto-list` Fields, meaning we save all their distinct
  values in a FieldValues object, which powers a list widget in the FE when using the Field for filtering in the QB.
  Admins can however manually mark any Field as `list`, which is effectively ordering Metabase to keep FieldValues for
  the Field regardless of its cardinality.

  Of course, if a User does something crazy, like mark a million-arity Field as List, we don't want Metabase to
  explode trying to make their dreams a reality; we need some sort of hard limit to prevent catastrophes. So this
  limit is effectively a safety to prevent Users from nuking their own instance for Fields that really shouldn't be
  List Fields at all. For these very-high-cardinality Fields, we're effectively capping the number of
  FieldValues that get could saved.

  This number should be a balance of:

  * Not being too low, which would definitly result in GitHub issues along the lines of 'My 500-distinct-value Field
    that I marked as List is not showing all values in the List Widget'
  * Not being too high, which would result in Metabase running out of memory dealing with too many values"
  (int 5000))

(s/defn field-distinct-values
  "Return the distinct values of `field`.
   This is used to create a `FieldValues` object for `:type/Category` Fields."
  ([field]
   (field-distinct-values field absolute-max-distinct-values-limit))

  ([field, max-results :- su/IntGreaterThanZero]
   (mapv first (field-query field {:breakout [[:field-id (u/get-id field)]]
                                   :limit    max-results}))))

(defn field-distinct-count
  "Return the distinct count of `field`."
  [field & [limit]]
  (-> (field-query field {:aggregation [[:distinct [:field-id (u/get-id field)]]]
                          :limit       limit})
      first first int))

(defn field-count
  "Return the count of `field`."
  [field]
  (-> (field-query field {:aggregation [[:count [:field-id (u/get-id field)]]]})
      first first int))

(def max-sample-rows
  "The maximum number of values we should return when using `table-rows-sample`. This many is probably fine for
  inferring special types and what-not; we don't want to scan millions of values at any rate."
  10000)

(s/defn table-rows-sample :- (s/maybe si/TableSample)
  "Run a basic MBQL query to fetch a sample of rows belonging to a Table."
  {:style/indent 1}
  [table :- si/TableInstance, fields :- [si/FieldInstance]]
  (let [results ((resolve 'metabase.query-processor/process-query)
                 {:database   (:db_id table)
                  :type       :query
                  :query      {:source-table (u/get-id table)
                               :fields       (vec (for [field fields]
                                                    [:field-id (u/get-id field)]))
                               :limit        max-sample-rows}
                  :middleware {:format-rows?           false
                               :skip-results-metadata? true}})]
    (get-in results [:data :rows])))
