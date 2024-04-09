(ns metabase.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require
   [cheshire.core :as json]
   [clojure.walk :as walk]
   [metabase.db :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Query
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/Query)

(methodical/defmethod t2/table-name :model/Query [_model] :query)
(methodical/defmethod t2.model/primary-keys :model/Query [_model] [:query_hash])

(t2/deftransforms :model/Query
 {:query mi/transform-json})

(derive :model/Query :metabase/model)

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

(mr/def ::database-and-table-ids
  [:map
   [:database-id ::lib.schema.id/database]
   [:table-id    [:maybe ::lib.schema.id/table]]])

(mu/defn ^:private pmbql-query->database-and-table-ids :- ::database-and-table-ids
  [{database-id :database, :as query} :- [:map
                                          [:lib/type [:= :mbql/query]]]]
  (if-let [source-card-id (lib.util/source-card-id query)]
    (let [card (lib.metadata/card query source-card-id)]
      (merge {:table-id nil} (select-keys card [:database-id :table-id])))
    (let [table-id (lib.util/source-table-id query)]
      {:database-id database-id
       :table-id    table-id})))

(mu/defn ^:private legacy-query->database-and-table-ids :- ::database-and-table-ids
  [{database-id :database, query-type :type, {:keys [source-table source-query]} :query} :- [:map
                                                                                             [:type [:enum :query :native]]]]
  (cond
    (= :native query-type)  {:database-id database-id, :table-id nil}
    (integer? source-table) {:database-id database-id, :table-id source-table}
    (string? source-table)  (let [[_ card-id] (re-find #"^card__(\d+)$" source-table)]
                              (t2/select-one [:model/Card [:table_id :table-id] [:database_id :database-id]]
                                             :id (Integer/parseInt card-id)))
    (map? source-query)     (legacy-query->database-and-table-ids {:database database-id
                                                                   :type     query-type
                                                                   :query    source-query})))

(mu/defn query->database-and-table-ids :- [:maybe ::database-and-table-ids]
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card.

  Handles either pMBQL (MLv2) queries or legacy MBQL queries. Handles source Cards by fetching them as needed."
  [query :- [:maybe :map]]
  (when query
    (when-let [f (case (lib/normalized-query-type query)
                   :mbql/query      pmbql-query->database-and-table-ids
                   (:native :query) legacy-query->database-and-table-ids
                   nil)]
      (f (mi/maybe-normalize-query :out query)))))

(defn- parse-source-query-id
  "Return the ID of the card used as source table, if applicable; otherwise return `nil`."
  [source-table]
  (when (string? source-table)
    (when-let [[_ card-id-str] (re-matches #"card__(\d+)" source-table)]
      (parse-long card-id-str))))

(defn collect-card-ids
  "Return a sequence of model ids referenced in the MBQL `query`."
  [query]
  (let [ids (java.util.HashSet.)
        walker (fn [form]
                 (when (map? form)
                   ;; model references in native queries
                   (when-let [card-id (:card-id form)]
                     (when (int? card-id)
                       (.add ids card-id)))
                   ;; source tables (possibly in joins)
                   ;;
                   ;; MLv2 `:source-card`
                   (when-let [card-id (:source-card form)]
                     (.add ids card-id))
                   ;; legacy MBQL card__<id> `:source-table`
                   (when-let [card-id (parse-source-query-id (:source-table form))]
                     (.add ids card-id)))
                 form)]
    (walk/prewalk walker query)
    (seq ids)))

(mu/defn adhoc-query :- (ms/InstanceOf :model/Query)
  "Wrap query map into a Query object (mostly to facilitate type dispatch)."
  [query :- :map]
  (mi/instance :model/Query
               (merge (query->database-and-table-ids query)
                      {:dataset_query (mi/maybe-normalize-query :out query)})))

(mu/defn query-is-native? :- :boolean
  "Whether this query (pMBQL or legacy) has a `:native` first stage. Queries with source Cards are considered to be MBQL
  regardless of whether the Card has a native query or not."
  [query :- :map]
  (case (lib/normalized-query-type query)
    :query      false
    :native     true
    :mbql/query (let [query (mi/maybe-normalize-query :out query)]
                  (lib.util/first-stage-is-native? query))
    false))
