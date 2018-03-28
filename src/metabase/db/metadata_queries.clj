(ns metabase.db.metadata-queries
  "Predefined MBQL queries for getting metadata about an external database."
  (:require [clojure.tools.logging :as log]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.models
             [field-values :as field-values]
             [table :refer [Table]]]
            [metabase.query-processor.interface :as qpi]
            [metabase.query-processor.middleware.expand :as ql]
            [toucan.db :as db]))

(defn- qp-query [db-id query]
  {:pre [(integer? db-id)]}
  (-> (binding [qpi/*disable-qp-logging* true]
        (qp/process-query
          {:type     :query
           :database db-id
           :query    query}))
      :data
      :rows))

(defn- field-query [{table-id :table_id} query]
  {:pre [(integer? table-id)]}
  (qp-query (db/select-one-field :db_id Table, :id table-id)
            ;; this seeming useless `merge` statement IS in fact doing something important. `ql/query` is a threading
            ;; macro for building queries. Do not remove
            (ql/query (merge query)
                      (ql/source-table table-id))))

(defn table-row-count
  "Fetch the row count of TABLE via the query processor."
  [table]
  {:pre  [(map? table)]
   :post [(integer? %)]}
  (let [results (qp-query (:db_id table) (ql/query (ql/source-table (u/get-id table))
                                                   (ql/aggregation (ql/count))))]
    (try (-> results first first long)
         (catch Throwable e
           (log/error "Error fetching table row count. Query returned:\n"
                      (u/pprint-to-str results))
           (throw e)))))

(defn field-distinct-values
  "Return the distinct values of FIELD.
   This is used to create a `FieldValues` object for `:type/Category` Fields."
  ([field]
   ;; fetch up to one more value than allowed for FieldValues. e.g. if the max is 100 distinct values fetch up to 101.
   ;; That way we will know if we're over the limit
   (field-distinct-values field (inc field-values/list-cardinality-threshold)))
  ([field max-results]
   {:pre [(integer? max-results)]}
   (mapv first (field-query field (-> {}
                                      (ql/breakout (ql/field-id (u/get-id field)))
                                      (ql/limit max-results))))))

(defn field-distinct-count
  "Return the distinct count of FIELD."
  [field & [limit]]
  (-> (field-query field (-> {}
                             (ql/aggregation (ql/distinct (ql/field-id (u/get-id field))))
                             (ql/limit limit)))
      first first int))

(defn field-count
  "Return the count of FIELD."
  [field]
  (-> (field-query field (ql/aggregation {} (ql/count (ql/field-id (u/get-id field)))))
      first first int))

(defn db-id
  "Return the database ID of a given entity."
  [x]
  (or (:db_id x)
      (:database_id x)
      (db/select-one-field :db_id 'Table :id (:table_id x))))
