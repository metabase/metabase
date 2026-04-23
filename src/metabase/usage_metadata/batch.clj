(ns metabase.usage-metadata.batch
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.queries.models.query :as query-model]
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.settings :as usage-metadata.settings]
   [metabase.usage-metadata.store :as usage-metadata.store]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize])
  (:import
   (java.nio ByteBuffer)
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(def ^:private utc-zone-offset
  (t/zone-offset "Z"))

(def ^:private rollup-models
  [:model/SourceSegmentDaily
   :model/SourceMetricDaily
   :model/SourceDimensionDaily
   :model/SourceDimensionProfileDaily])

(def ^:private low-cardinality-threshold
  30)

(defn- today-utc []
  (t/local-date (t/offset-date-time utc-zone-offset)))

(defn- yesterday-utc []
  (t/minus (today-utc) (t/days 1)))

(defn- parse-watermark [watermark]
  (when (seq watermark)
    (t/local-date watermark)))

(defn- hash-key [hash-bytes]
  (when hash-bytes
    (ByteBuffer/wrap ^bytes hash-bytes)))

(defn target-days
  "Return the closed UTC days the scheduled batch should process."
  ([] (target-days {:last-completed-day (parse-watermark (usage-metadata.settings/usage-metadata-last-completed-day))
                    :retention-days     (usage-metadata.settings/usage-metadata-retention-days)
                    :yesterday          (yesterday-utc)}))
  ([{:keys [last-completed-day retention-days yesterday]}]
   (let [retention-days (max 1 (or retention-days 1))
         yesterday      (or yesterday (yesterday-utc))
         retention-start (t/minus yesterday (t/days (dec retention-days)))
         next-day       (some-> last-completed-day (t/plus (t/days 1)))
         start-day      (if next-day
                          (if (neg? (compare retention-start next-day))
                            next-day
                            retention-start)
                          retention-start)]
     (loop [day  start-day
            days []]
       (if (pos? (compare day yesterday))
         days
         (recur (t/plus day (t/days 1))
                (conj days day)))))))

(defn- utc-day-start [bucket-date]
  (t/offset-date-time bucket-date (t/local-time 0) utc-zone-offset))

(defn- utc-day-end [bucket-date]
  (-> bucket-date
      utc-day-start
      (t/plus (t/days 1))))

(defn- execution-hash-counts-for-day
  "Return `[{:hash byte[], :n execution-count} ...]` for a UTC day.

  Identical hashes produce identical facts, so collapse at the DB and iterate
  unique hashes. Per-execution totals come from multiplying by `:n`."
  [bucket-date]
  (t2/select [:model/QueryExecution :hash [:%count.* :n]]
             {:where    [:and
                         [:>= :started_at (utc-day-start bucket-date)]
                         [:<  :started_at (utc-day-end bucket-date)]]
              :group-by [:hash]}))

(defn- query-database-id [stored-query]
  (let [stage-0       (first (:stages stored-query))
        legacy-query  (:query stored-query)
        source-table  (or (:source-table stage-0)
                          (:source-table legacy-query))
        source-card   (or (:source-card stage-0)
                          (:source-card legacy-query))
        {:keys [database-id table-id]} (try
                                         (query-model/query->database-and-table-ids stored-query)
                                         (catch Throwable e
                                           (log/debug e "usage-metadata: query->database-and-table-ids failed")
                                           nil))]
    (or (:database stored-query)
        database-id
        (when source-table
          (t2/select-one-fn :db_id :model/Table :id source-table))
        (when-let [source-card source-card]
          (t2/select-one-fn :database_id :model/Card :id source-card))
        (when table-id
          (t2/select-one-fn :db_id :model/Table :id table-id)))))

(defn- add-skip [stats reason n]
  (update-in stats [:skipped-rows reason] (fnil + 0) n))

(defn- normalize-query [stored-query]
  (when-let [database-id (query-database-id stored-query)]
    (lib/query (lib-be/application-database-metadata-provider database-id)
               stored-query)))

(defn- query->facts [stored-query]
  (let [normalized-query (try
                           (normalize-query stored-query)
                           (catch Throwable _
                             ::normalize-error))]
    (cond
      (= normalized-query ::normalize-error)
      {:status :skip, :reason :normalize-error}

      (nil? normalized-query)
      {:status :skip, :reason :missing-database-id}

      (nil? (usage-metadata.extract/select-root-owner normalized-query))
      {:status :skip, :reason :unsupported-query}

      :else
      (try
        {:status :ok
         :facts  (usage-metadata.extract/extract-usage-facts normalized-query)}
        (catch Throwable _
          {:status :skip, :reason :extract-error})))))

(defn- aggregate-row [rows row n]
  (update rows row (fnil + 0) n))

(defn- segment-row [bucket-date {:keys [source-type source-id ownership-mode field-id predicate]}]
  {:source_type    source-type
   :source_id      source-id
   :ownership_mode ownership-mode
   :field_id       field-id
   :predicate      predicate
   :bucket_date    bucket-date})

(defn- metric-row [bucket-date {:keys [source-type source-id ownership-mode agg agg-field-id temporal-field-id temporal-unit]}]
  {:source_type       source-type
   :source_id         source-id
   :ownership_mode    ownership-mode
   :agg_type          agg
   :agg_field_id      agg-field-id
   :temporal_field_id temporal-field-id
   :temporal_unit     temporal-unit
   :bucket_date       bucket-date})

(defn- dimension-row [bucket-date {:keys [source-type source-id ownership-mode field-id temporal-unit binning]}]
  {:source_type    source-type
   :source_id      source-id
   :ownership_mode ownership-mode
   :field_id       field-id
   :temporal_unit  temporal-unit
   :binning        binning
   :bucket_date    bucket-date})

(defn- counts->rows [counts]
  (mapv (fn [[row count]]
          (assoc row :count count))
        counts))

(defn- accumulate-query-result [stats bucket-date n result]
  (if (= :ok (:status result))
    (let [{:keys [segments metrics dimensions]} (:facts result)
          add-rows (fn [acc rows row-fn]
                     (reduce (fn [m fact] (aggregate-row m (row-fn bucket-date fact) n))
                             acc
                             rows))]
      (-> stats
          (update :segment-tuples   + (* n (count segments)))
          (update :metric-tuples    + (* n (count metrics)))
          (update :dimension-tuples + (* n (count dimensions)))
          (update :segments   add-rows segments   segment-row)
          (update :metrics    add-rows metrics    metric-row)
          (update :dimensions add-rows dimensions dimension-row)))
    (add-skip stats (:reason result) n)))

(defn- fingerprint-observations
  [fingerprint]
  (let [distinct-count (get-in fingerprint [:global :distinct-count])
        nil-pct        (get-in fingerprint [:global :nil%])]
    (cond-> []
      (= 1 distinct-count)
      (conj {:observation_type :single-value
             :observation_value nil})

      (= 1.0 nil-pct)
      (conj {:observation_type :all-null
             :observation_value nil})

      (and (integer? distinct-count)
           (> distinct-count 1)
           (<= distinct-count low-cardinality-threshold)
           (or (nil? nil-pct) (< nil-pct 1.0)))
      (conj {:observation_type :low-cardinality
             :observation_value (str distinct-count)}))))

(defn- decode-fingerprint
  [value]
  (cond
    (map? value)
    value

    (instance? PGobject value)
    (some-> ^PGobject value .getValue json/decode+kw)

    (string? value)
    (json/decode+kw value)

    :else
    nil))

(defn- field-fingerprint
  [field-id]
  (some-> (t2/select-one-fn :fingerprint :metabase_field :id field-id)
          decode-fingerprint))

(defn- profile-rows-for-dimensions
  [bucket-date dimension-rows]
  (into []
        (mapcat (fn [{:keys [source_type source_id ownership_mode field_id count]}]
                  (when (and (= source_type :table)
                             (= ownership_mode :direct)
                             (pos-int? field_id))
                    (when-let [fingerprint (field-fingerprint field_id)]
                      (for [{:keys [observation_type observation_value]} (fingerprint-observations fingerprint)]
                        {:source_type       source_type
                         :source_id         source_id
                         :field_id          field_id
                         :source_basis      :fingerprint
                         :observation_type  observation_type
                         :observation_value observation_value
                         :bucket_date       bucket-date
                         :count             count})))))
        dimension-rows))

(defn- process-query-row
  [bucket-date hash->count stats {:keys [query_hash query]}]
  (let [hash-bb (hash-key query_hash)
        n       (get hash->count hash-bb)
        stats   (update stats :seen-hashes conj hash-bb)]
    (if n
      (-> stats
          (update :joined-rows + n)
          (accumulate-query-result bucket-date n (query->facts query)))
      stats)))

(defn process-day!
  "Process one UTC bucket day.

  By default this advances the scheduled watermark after a successful replace-day write.
  Pass `{:advance-watermark? false}` for manual reprocessing of any day without changing
  scheduled batch state."
  ([bucket-date]
   (process-day! bucket-date {:advance-watermark? true}))
  ([bucket-date {:keys [advance-watermark?]
                 :or   {advance-watermark? true}}]
   (let [hash-counts      (execution-hash-counts-for-day bucket-date)
         raw-hashes       (mapv :hash hash-counts)
         hash->count      (into {} (map (fn [{:keys [hash n]}] [(hash-key hash) n])) hash-counts)
         initial-stats    {:bucket-date          bucket-date
                           :query-execution-rows (reduce + 0 (vals hash->count))
                           :joined-rows          0
                           :segment-tuples       0
                           :metric-tuples        0
                           :dimension-tuples     0
                           :profile-observations 0
                           :skipped-rows         {}
                           :segments             {}
                           :metrics              {}
                           :dimensions           {}
                           :seen-hashes          #{}}
         after-stream     (if (seq raw-hashes)
                            (transduce
                             (map t2.realize/realize)
                             (completing (partial process-query-row bucket-date hash->count))
                             initial-stats
                             (mdb/streaming-reducible
                              (fn [conn]
                                (t2/reducible-select :conn conn [:model/Query :query_hash :query]
                                                     :query_hash [:in raw-hashes]))))
                            initial-stats)
         seen-hashes      (:seen-hashes after-stream)
         day-stats        (reduce-kv
                           (fn [stats hash-bb n]
                             (if (contains? seen-hashes hash-bb)
                               stats
                               (add-skip stats :missing-query n)))
                           (dissoc after-stream :seen-hashes)
                           hash->count)
         dimension-rows   (counts->rows (:dimensions day-stats))
         profile-rows     (profile-rows-for-dimensions bucket-date dimension-rows)
         payload          {:segments   (counts->rows (:segments day-stats))
                           :metrics    (counts->rows (:metrics day-stats))
                           :dimensions dimension-rows
                           :profiles   profile-rows}]
     (usage-metadata.store/replace-day! bucket-date payload)
     (when advance-watermark?
       (usage-metadata.settings/usage-metadata-last-completed-day! (str bucket-date)))
     (assoc day-stats
            :watermark-advanced? advance-watermark?
            :segment-rollup-rows (count (:segments payload))
            :metric-rollup-rows (count (:metrics payload))
            :dimension-rollup-rows (count (:dimensions payload))
            :profile-observations (count (:profiles payload))))))

(defn reprocess-day!
  "Manual entrypoint for reprocessing any UTC day without advancing the scheduled watermark."
  [bucket-date]
  (process-day! bucket-date {:advance-watermark? false}))

(defn delete-expired-rollups!
  "Delete rollup rows older than the retention cutoff and return that cutoff day."
  [retention-days today]
  (let [retention-days (max 1 (or retention-days 1))
        cutoff-day     (t/minus today (t/days retention-days))]
    (doseq [model rollup-models]
      (t2/delete! model :bucket_date [:< cutoff-day]))
    cutoff-day))

(defn run-batch!
  "Process all currently targetable closed UTC days and return a run summary."
  ([] (run-batch! {:today              (today-utc)
                   :last-completed-day (parse-watermark (usage-metadata.settings/usage-metadata-last-completed-day))
                   :retention-days     (usage-metadata.settings/usage-metadata-retention-days)}))
  ([{:keys [today last-completed-day retention-days]
     :or   {today (today-utc)}}]
   (let [days       (target-days {:last-completed-day last-completed-day
                                  :retention-days     retention-days
                                  :yesterday          (t/minus today (t/days 1))})
         started-ns (System/nanoTime)
         cutoff     (delete-expired-rollups! retention-days today)
         initial    {:status                :success
                     :days-targeted         (count days)
                     :days-processed        0
                     :query-execution-rows  0
                     :joined-rows           0
                     :segment-tuples        0
                     :metric-tuples         0
                     :dimension-tuples      0
                     :profile-observations  0
                     :segment-rollup-rows   0
                     :metric-rollup-rows    0
                     :dimension-rollup-rows 0
                     :skipped-rows          {}
                     :retention-cutoff      cutoff
                     :watermark-advanced-to last-completed-day}]
     (lib-be/with-metadata-provider-cache
       (let [raw-result (reduce
                         (fn [summary bucket-date]
                           (try
                             (let [day-result (process-day! bucket-date {:advance-watermark? true})]
                               (-> summary
                                   (update :days-processed inc)
                                   (update :query-execution-rows + (:query-execution-rows day-result))
                                   (update :joined-rows + (:joined-rows day-result))
                                   (update :segment-tuples + (:segment-tuples day-result))
                                   (update :metric-tuples + (:metric-tuples day-result))
                                   (update :dimension-tuples + (:dimension-tuples day-result))
                                   (update :profile-observations + (:profile-observations day-result))
                                   (update :segment-rollup-rows + (:segment-rollup-rows day-result))
                                   (update :metric-rollup-rows + (:metric-rollup-rows day-result))
                                   (update :dimension-rollup-rows + (:dimension-rollup-rows day-result))
                                   (update :skipped-rows #(merge-with + % (:skipped-rows day-result)))
                                   (assoc :watermark-advanced-to (:bucket-date day-result))))
                             (catch Throwable e
                               (reduced
                                (assoc summary
                                       :status :failed
                                       :error e
                                       :watermark-advanced-to
                                       (parse-watermark (usage-metadata.settings/usage-metadata-last-completed-day)))))))
                         initial
                         days)
             elapsed-ms (long (/ (- (System/nanoTime) started-ns) 1000000))
             final-result (assoc raw-result :elapsed-ms elapsed-ms)]
         (log/info "Usage metadata batch summary" (dissoc final-result :error))
         (when-let [e (:error final-result)]
           (throw e))
         final-result)))))
