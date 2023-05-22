(ns metabase.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require
   [cheshire.core :as json]
   [clojure.walk :as walk]
   [metabase.db :as mdb]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(models/defmodel Query :query)

(mi/define-methods
 Query
 {:types       (constantly {:query :json})
  :primary-key (constantly :query_hash)})

;;; Helper Fns

(defn average-execution-time-ms
  "Fetch the average execution time (in milliseconds) for query with QUERY-HASH if available.
   Returns `nil` if no information is available."
  ^Integer [^bytes query-hash]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  (t2/select-one-fn :average_execution_time Query :query_hash query-hash))

(defn- int-casting-type
  "Return appropriate type for use in SQL `CAST(x AS type)` statement.
   MySQL doesn't accept `integer`, so we have to use `unsigned`; Postgres doesn't accept `unsigned`.
   so we have to use `integer`. Yay SQL dialect differences :D"
  []
  (if (= (mdb/db-type) :mysql)
    :unsigned
    :integer))

(defn- update-rolling-average-execution-time!
  "Update the rolling average execution time for query with `query-hash`. Returns `true` if a record was updated,
   or `false` if no matching records were found."
  ^Boolean [query ^bytes query-hash ^Integer execution-time-ms]
  (let [avg-execution-time (h2x/cast (int-casting-type) (h2x/round (h2x/+ (h2x/* [:inline 0.9] :average_execution_time)
                                                                          [:inline (* 0.1 execution-time-ms)])
                                                                   [:inline 0]))]

    (or
     ;; if it DOES NOT have a query (yet) set that. In 0.31.0 we added the query.query column, and it gets set for all
     ;; new entries, so at some point in the future we can take this out, and save a DB call.
     (pos? (t2/update! Query
                       {:query_hash query-hash, :query nil}
                       {:query                 (json/generate-string query)
                        :average_execution_time avg-execution-time}))
     ;; if query is already set then just update average_execution_time. (We're doing this separate call to avoid
     ;; updating query on every single UPDATE)
     (pos? (t2/update! Query
                       {:query_hash query-hash}
                       {:average_execution_time avg-execution-time})))))

(defn- record-new-query-entry!
  "Record a query and its execution time for a `query` with `query-hash` that's not already present in the DB.
  `execution-time-ms` is used as a starting point."
  [query ^bytes query-hash ^Integer execution-time-ms]
  (first (t2/insert-returning-instances! Query
                                         :query                  query
                                         :query_hash             query-hash
                                         :average_execution_time execution-time-ms)))

(defn save-query-and-update-average-execution-time!
  "Update the recorded average execution time (or insert a new record if needed) for `query` with `query-hash`."
  [query, ^bytes query-hash, ^Integer execution-time-ms]
  {:pre [(instance? (Class/forName "[B") query-hash)]}
  (or
   ;; if there's already a matching Query update the rolling average
   (update-rolling-average-execution-time! query query-hash execution-time-ms)
   ;; otherwise try adding a new entry. If for some reason there was a race condition and a Query entry was added in
   ;; the meantime we'll try updating that existing record
   (try (record-new-query-entry! query query-hash execution-time-ms)
        (catch Throwable e
          (or (update-rolling-average-execution-time! query query-hash execution-time-ms)
              ;; rethrow e if updating an existing average execution time failed
              (throw e))))))

(defn query->database-and-table-ids
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card. Handles queries that use
   other queries as their source (ones that come in with a `:source-table` like `card__100`, or `:source-query`)
   recursively, as well as normal queries."
  [{database-id :database, query-type :type, {:keys [source-table source-query]} :query}]
  (cond
    (= :native query-type)  {:database-id database-id, :table-id nil}
    (integer? source-table) {:database-id database-id, :table-id source-table}
    (string? source-table)  (let [[_ card-id] (re-find #"^card__(\d+)$" source-table)]
                              (t2/select-one ['Card [:table_id :table-id] [:database_id :database-id]]
                                :id (Integer/parseInt card-id)))
    (map? source-query)     (query->database-and-table-ids {:database database-id
                                                            :type     query-type
                                                            :query    source-query})))

(defn- parse-source-query-id
  "Return the ID of the card used as source table, if applicable; otherwise return `nil`."
  [source-table]
  (when (string? source-table)
    (when-let [[_ card-id-str] (re-matches #"card__(\d+)" source-table)]
      (parse-long card-id-str))))

(defn collect-card-ids
  "Return a sequence of model ids referenced in the MBQL query `mbql-form`."
  [mbql-form]
  (let [ids (java.util.HashSet.)
        walker (fn [form]
                 (when (map? form)
                   ;; model references in native queries
                   (when-let [card-id (:card-id form)]
                     (when (int? card-id)
                       (.add ids card-id)))
                   ;; source tables (possibly in joins)
                   (when-let [card-id (parse-source-query-id (:source-table form))]
                     (.add ids card-id)))
                 form)]
    (walk/prewalk walker mbql-form)
    (seq ids)))

(defn adhoc-query
  "Wrap query map into a Query object (mostly to facilitate type dispatch)."
  [query]
  (->> query
       mbql.normalize/normalize
       (hash-map :dataset_query)
       (merge (query->database-and-table-ids query))
       (mi/instance Query)))
