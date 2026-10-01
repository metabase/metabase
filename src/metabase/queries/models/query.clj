(ns metabase.queries.models.query
  "Functions related to the 'Query' model, which records stuff such as average query execution time."
  (:require
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.db :as queries.db]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model])
  (:import
   (java.nio ByteBuffer)))

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
  (queries.db/average-execution-time query-hash))

(def ^:private smoothing-factor
  "The weight of the latest execution time in the exponential rolling average formula:

    new-average = decay-factor * average + smoothing-factor * execution-time"
  0.1)

(def ^:private decay-factor
  "The weight of the previous average in the exponential rolling average formula, see [[smoothing-factor]]."
  (- 1.0 smoothing-factor))

(defn- update-rolling-average-execution-time!
  "Update the rolling average execution time for query with `query-hash`. Returns `true` if a record was updated,
   or `false` if no matching records were found."
  ^Boolean [query ^bytes query-hash ^Integer execution-time-ms]
  (let [c1 (* smoothing-factor execution-time-ms)]
    (or
     ;; if it DOES NOT have a query (yet) set that. In 0.31.0 we added the query.query column, and it gets set for all
     ;; new entries, so at some point in the future we can take this out, and save a DB call.
     (pos? (queries.db/backfill-query-and-average-execution-time! query-hash (json/encode query) decay-factor c1))
     ;; if query is already set then just update average_execution_time. (We're doing this separate call to avoid
     ;; updating query on every single UPDATE)
     (pos? (queries.db/update-average-execution-time! query-hash decay-factor c1)))))

(defn- rolling-average-coefficients
  "Collapse applying the rolling-average formula (see [[smoothing-factor]]) once per execution time into a single
  linear equation `new-average = c0 * average + c1`."
  [execution-times-ms]
  (reduce (fn [[c0 c1] t]
            [(* decay-factor c0) (+ (* decay-factor c1) (* smoothing-factor t))])
          [1.0 0.0]
          execution-times-ms))

(defn- initial-average-execution-time
  "Average execution time for a new Query entry: the first execution time, with any subsequent ones folded in the same
  way consecutive [[update-rolling-average-execution-time!]] calls would."
  ^long [execution-times-ms]
  (reduce (fn [avg t]
            (Math/round (+ (* decay-factor (double avg)) (* smoothing-factor (double t)))))
          (long (first execution-times-ms))
          (rest execution-times-ms)))

(defn- hash-key
  "Wrap a query-hash byte array so it can be used as a map key: unlike byte arrays themselves, `ByteBuffer`s have
  value-based equality and hash code."
  [hash-bytes]
  (when hash-bytes
    (ByteBuffer/wrap ^bytes hash-bytes)))

(defn- update-rolling-average-execution-times!
  "Update the rolling average execution times for `groups` (each a sequence of entries sharing a query hash) with a
  single atomic UPDATE."
  [groups]
  (when (seq groups)
    (let [hash+coefficients (vec (for [group groups]
                                   (let [[c0 c1] (rolling-average-coefficients (map :execution-time-ms group))]
                                     [(:query-hash (first group)) c0 c1])))]
      (queries.db/update-average-execution-times! hash+coefficients))))

(defn- insert-query-entries!
  "Insert new Query rows for `groups` (each a sequence of entries sharing a query hash) with a single INSERT."
  [groups]
  (queries.db/insert-queries! (for [group groups]
                                {:query                  (:query (first group))
                                 :query_hash             (:query-hash (first group))
                                 :average_execution_time (initial-average-execution-time
                                                          (map :execution-time-ms group))})))

(defn- query-hash->row-status
  "Fetch which of `query-hashes` already have Query rows. Returns a map of [[hash-key]] -> `:up-to-date` or
  `:needs-query-backfill` (for rows predating 0.31.0 whose `query` column was never set); hashes without a row are
  absent from the map."
  [query-hashes]
  (if (empty? query-hashes)
    {}
    (into {}
          (map (fn [{:keys [query_hash missing_query]}]
                 [(hash-key query_hash)
                  ;; mysql returns 0/1 instead of booleans
                  (if (contains? #{true 1} missing_query)
                    :needs-query-backfill
                    :up-to-date)]))
          (queries.db/query-hash-statuses-reducible query-hashes))))

(defn save-queries-and-update-average-execution-times!
  "Update the recorded average execution times (or insert new records as needed) for `entries`, maps with `:query`,
  `:query-hash`, and `:execution-time-ms` keys, using a fixed number of statements rather than several per entry.
  Multiple entries for the same hash are folded into a single atomic update equivalent to applying the rolling-average
  formula once per entry, in order.

  The INSERT of new Query rows runs in a nested transaction (a savepoint), so that if it conflicts inside a caller's
  transaction (e.g. when batch updates run synchronously inside a transaction in tests), the constraint violation
  doesn't abort the outer transaction -- Postgres refuses to run any further statements in a transaction with a failed
  statement otherwise. A conflict means someone else just inserted one of these hashes with its own initial average;
  dropping this batch's samples for a brand-new row doesn't meaningfully change the rolling average, so there is no
  need to retry."
  [entries]
  (when (seq entries)
    (let [groups       (vals (group-by (fn [entry] (hash-key (:query-hash entry))) entries))
          hash->status (query-hash->row-status (map (fn [group] (:query-hash (first group))) groups))
          {:keys [up-to-date needs-query-backfill new-entry]}
          (group-by (fn [group]
                      (get hash->status (hash-key (:query-hash (first group))) :new-entry))
                    groups)]
      (update-rolling-average-execution-times! up-to-date)
      ;; rare legacy path: rows whose `query` still needs backfilling are handled individually
      (doseq [{:keys [query query-hash execution-time-ms]} (apply concat needs-query-backfill)]
        (update-rolling-average-execution-time! query query-hash execution-time-ms))
      (when (seq new-entry)
        (try
          (t2/with-transaction [_conn]
            (insert-query-entries! new-entry))
          (catch Throwable e
            (log/tracef "Error inserting concurrently created Query entries: %s" (ex-message e))))))))

(mr/def ::database-and-table-ids
  [:map
   [:database-id ::lib.schema.id/database]
   [:table-id    [:maybe ::lib.schema.id/table]]])

(mu/defn query->database-and-table-ids :- [:maybe ::database-and-table-ids]
  "Return a map with `:database-id` and source `:table-id` that should be saved for a Card.

  Expects MBQL 5 queries."
  [{database-id :database, :as query} :- [:or ::lib.schema/query ::lib-be.schema/empty-query]]
  (when (seq query)
    (if-let [source-card-id (lib/primary-source-card-id query)]
      (let [card (or (lib.metadata/card query source-card-id)
                     ;; Card may belong to a different Database; fetch from the app DB
                     (queries.db/card-database-and-table-ids source-card-id))]
        (merge {:table-id nil, :database-id (:database query)} (select-keys card [:database-id :table-id])))
      (let [table-id (lib/primary-source-table-id query)]
        {:database-id database-id
         :table-id    table-id}))))

(mu/defn query-is-native? :- :boolean
  "Whether this query (MBQL 5 or legacy) has a `:native` first stage. Queries with source Cards are considered to be MBQL
  regardless of whether the Card has a native query or not."
  [query :- [:maybe [:or ::lib.schema/query ::lib-be.schema/empty-query]]]
  (boolean (some-> query not-empty lib/native-only-query?)))
