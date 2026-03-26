(ns metabase.queries.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

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
  (t2/select-one-fn :average_execution_time :model/Query :query_hash query-hash))

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
     (pos? (t2/update! :model/Query
                       {:query_hash query-hash, :query nil}
                       {:query                 (json/encode query)
                        :average_execution_time avg-execution-time}))
     ;; if query is already set then just update average_execution_time. (We're doing this separate call to avoid
     ;; updating query on every single UPDATE)
     (pos? (t2/update! :model/Query
                       {:query_hash query-hash}
                       {:average_execution_time avg-execution-time})))))

(defn- record-new-query-entry!
  "Record a query and its execution time for a `query` with `query-hash` that's not already present in the DB.
  `execution-time-ms` is used as a starting point."
  [query ^bytes query-hash ^Integer execution-time-ms]
  (first (t2/insert-returning-instances! :model/Query
                                         :query                  query
                                         :query_hash             query-hash
                                         :average_execution_time execution-time-ms)))

(defn save-query-and-update-average-execution-time!
  "Update the recorded average execution time (or insert a new record if needed) for `query` with `query-hash`."
  [query ^bytes query-hash ^Integer execution-time-ms]
  {:pre [(bytes? query-hash)]}
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

(defn- combined-rolling-average-params
  "Given a sequence of execution times for the same query hash, compute the combined
  rolling-average parameters: `{:decay d, :weighted-sum w}`.

  When applied: `new_avg = ROUND(d * old_avg + w, 0)`

  For k times [t₁ … tₖ]: decay = 0.9^k, weighted-sum = 0.1 × Σᵢ 0.9^(k-1-i) × tᵢ"
  [running-times]
  (let [k     (count running-times)
        decay (Math/pow 0.9 k)
        wsum  (reduce (fn [acc [i t]]
                        (+ acc (* 0.1 (Math/pow 0.9 (- k 1 i)) (double t))))
                      0.0
                      (map-indexed vector running-times))]
    {:decay decay :weighted-sum wsum}))

(defn batch-save-query-and-update-average-execution-time!
  "Batch version of [[save-query-and-update-average-execution-time!]] for use with grouper.
  Receives a seq of `{:query, :query-hash, :running-time}` maps. Groups by query-hash,
  computes combined rolling averages, and executes as few SQL statements as possible:
  1 SELECT + 1 UPDATE (existing hashes) + 1 INSERT (new hashes)."
  [items]
  (when (seq items)
    (try
      (let [by-hash      (group-by :query-hash items)
            hash->params (into {}
                               (map (fn [[h entries]]
                                      (let [params (combined-rolling-average-params (mapv :running-time entries))]
                                        [h (assoc params :query (:query (peek entries)))])))
                               by-hash)
            all-hashes   (vec (keys hash->params))
            ;; 1. Find which hashes already exist
            existing     (into #{} (map :query_hash)
                               (t2/query {:select [:query_hash]
                                          :from   [:query]
                                          :where  [:in :query_hash all-hashes]}))
            to-update    (filterv existing all-hashes)
            to-insert    (filterv (complement existing) all-hashes)]
        ;; 2. Batch UPDATE existing rows — single UPDATE with CASE
        (when (seq to-update)
          (let [avg-case   (into [:case]
                                 (mapcat (fn [h]
                                           (let [{:keys [decay weighted-sum]} (hash->params h)]
                                             [[:= :query_hash h]
                                              (h2x/cast (int-casting-type)
                                                        (h2x/round
                                                         (h2x/+ (h2x/* [:inline decay] :average_execution_time)
                                                                [:inline weighted-sum])
                                                         [:inline 0]))])))
                                 to-update)
                query-case (into [:case]
                                 (mapcat (fn [h]
                                           [[:= :query_hash h]
                                            (json/encode (:query (hash->params h)))]))
                                 to-update)]
            (t2/query {:update :query
                       :set    {:average_execution_time avg-case
                                :query                 [:case [:= :query nil] query-case
                                                        :else :query]}
                       :where  [:in :query_hash to-update]})))
        ;; 3. Batch INSERT new rows — single INSERT
        (when (seq to-insert)
          (let [rows (mapv (fn [h]
                             (let [{:keys [weighted-sum query]} (hash->params h)
                                   k   (count (get by-hash h))
                                   ;; For new rows there's no old average to decay against.
                                   ;; Recover the effective average from the weighted sum:
                                   ;; weighted-sum = 0.1 × Σ 0.9^(k-1-i) × tᵢ
                                   ;; The contribution fraction is (1 - 0.9^k), so:
                                   ;; effective_avg = weighted-sum / (1 - 0.9^k)
                                   avg (long (Math/round (/ weighted-sum (- 1.0 (Math/pow 0.9 k)))))]
                               {:query_hash             h
                                :query                  (json/encode query)
                                :average_execution_time avg}))
                           to-insert)]
            (try
              (t2/insert! :model/Query rows)
              (catch Throwable _e
                ;; Race condition: another thread inserted the same hash. Fall back to individual updates.
                (doseq [h to-insert]
                  (try
                    (save-query-and-update-average-execution-time!
                     (:query (hash->params h)) h
                     (:running-time (last (get by-hash h))))
                    (catch Throwable e2
                      (log/error e2 "Error saving query execution time for hash")))))))))
      (catch Throwable e
        (log/error e "Error in batch-save-query-and-update-average-execution-time!")))))

(mr/def ::database-and-table-ids
  [:map
   [:database-id ::lib.schema.id/database]
   [:table-id    [:maybe ::lib.schema.id/table]]])

(mu/defn query->database-and-table-ids :- [:maybe ::database-and-table-ids]
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card.

  Expects MBQL 5 queries."
  [{database-id :database, :as query} :- ::queries.schema/query]
  (when (seq query)
    (if-let [source-card-id (lib/primary-source-card-id query)]
      (let [card (or (lib.metadata/card query source-card-id)
                     ;; Card may belong to a different Database; fetch from the app DB
                     (t2/select-one [:model/Card [:database_id :database-id] [:table_id :table-id]] :id source-card-id))]
        (merge {:table-id nil, :database-id (:database query)} (select-keys card [:database-id :table-id])))
      (let [table-id (lib/primary-source-table-id query)]
        {:database-id database-id
         :table-id    table-id}))))

(mu/defn query-is-native? :- :boolean
  "Whether this query (MBQL 5 or legacy) has a `:native` first stage. Queries with source Cards are considered to be MBQL
  regardless of whether the Card has a native query or not."
  [query :- [:maybe ::queries.schema/query]]
  (boolean (some-> query not-empty lib/native-only-query?)))
