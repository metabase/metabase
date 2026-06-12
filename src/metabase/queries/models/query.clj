(ns metabase.queries.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase.app-db.core :as mdb]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.json :as json]
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

(defn- rolling-average-coefficients
  "Collapse applying the rolling-average formula (`new-avg = 0.9 * avg + 0.1 * t`) once per execution time into a
  single linear equation `new-avg = c0 * avg + c1`."
  [execution-times-ms]
  (reduce (fn [[c0 c1] t]
            [(* 0.9 c0) (+ (* 0.9 c1) (* 0.1 t))])
          [1.0 0.0]
          execution-times-ms))

(defn- initial-average-execution-time
  "Average execution time for a new Query entry: the first execution time, with any subsequent ones folded in the same
  way consecutive [[update-rolling-average-execution-time!]] calls would."
  ^long [execution-times-ms]
  (reduce (fn [avg t]
            (Math/round (+ (* 0.9 (double avg)) (* 0.1 (double t)))))
          (long (first execution-times-ms))
          (rest execution-times-ms)))

(defn- save-queries-and-update-average-execution-times!*
  [entries remaining-attempts]
  (when (seq entries)
    ;; group by the hex representation since byte arrays don't have value-based equality
    (let [hex->entries  (group-by #(codecs/bytes->hex (:query-hash %)) entries)
          query-hashes  (map (comp :query-hash first val) hex->entries)
          existing-rows (t2/query {:select [:query_hash [[:= :query nil] :missing_query]]
                                   :from   [(t2/table-name :model/Query)]
                                   :where  [:in :query_hash query-hashes]})
          ;; mysql returns 0/1 instead of booleans
          hex->legacy?  (into {} (map (juxt #(codecs/bytes->hex (:query_hash %))
                                            (comp boolean #{true 1} :missing_query)))
                              existing-rows)
          ;; nil = no existing row for this hash
          {batchable false, legacy true, new-groups nil} (group-by (comp hex->legacy? key) hex->entries)]
      ;; one atomic UPDATE for all existing rows
      (when-let [hash+exprs (not-empty
                             (for [[_hex group] batchable
                                   :let [[c0 c1] (rolling-average-coefficients (map :execution-time-ms group))]]
                               [(:query-hash (first group))
                                (h2x/cast (int-casting-type)
                                          (h2x/round (h2x/+ (h2x/* [:inline c0] :average_execution_time)
                                                            [:inline c1])
                                                     [:inline 0]))]))]
        (t2/query {:update (t2/table-name :model/Query)
                   :set    {:average_execution_time (into [:case]
                                                          (mapcat (fn [[query-hash expr]]
                                                                    [[:= :query_hash query-hash] expr]))
                                                          hash+exprs)}
                   :where  [:in :query_hash (map first hash+exprs)]}))
      ;; pre-0.31.0 rows whose `query` still needs backfilling: rare legacy path, handle individually
      (doseq [[_hex group] legacy
              {:keys [query query-hash execution-time-ms]} group]
        (update-rolling-average-execution-time! query query-hash execution-time-ms))
      ;; one multi-row INSERT for hashes we haven't seen before. If some other instance beat us to inserting any of
      ;; them, retry: the next attempt will see the conflicting rows as existing and fold them into the batched
      ;; UPDATE instead.
      (when (seq new-groups)
        (try
          (t2/insert! :model/Query (for [[_hex group] new-groups]
                                     {:query                  (:query (first group))
                                      :query_hash             (:query-hash (first group))
                                      :average_execution_time (initial-average-execution-time
                                                               (map :execution-time-ms group))}))
          (catch Throwable e
            (if (pos? remaining-attempts)
              (save-queries-and-update-average-execution-times!* (mapcat val new-groups) (dec remaining-attempts))
              (throw e))))))))

(defn save-queries-and-update-average-execution-times!
  "Update the recorded average execution times (or insert new records as needed) for `entries`, maps with `:query`,
  `:query-hash`, and `:execution-time-ms` keys, using a fixed number of statements rather than several per entry.
  Multiple entries for the same hash are folded into a single atomic update equivalent to applying the rolling-average
  formula once per entry, in order."
  [entries]
  (save-queries-and-update-average-execution-times!* entries 2))

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
