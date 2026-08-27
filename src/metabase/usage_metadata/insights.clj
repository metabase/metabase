(ns metabase.usage-metadata.insights
  "Read-side projections over persisted usage-metadata rollups."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.frequent-itemsets :as frequent-itemsets]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.query-utils :as query-utils]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- decode-predicate
  "Parse a canonicalized predicate JSON string back into an MBQL 5 clause."
  [predicate-json]
  (some-> predicate-json
          json/decode+kw
          lib/normalize))

(defn- decode-binning
  "Parse a canonicalized binning JSON string back into a map."
  [binning-json]
  (some-> binning-json
          json/decode+kw))

(defn- build-field-index
  "Bulk-fetch Field rows for `field-ids` and return a map of `id -> {:id :name :display-name}`.

  Avoids the per-field `Field` + `Table` + metadata-provider roundtrip that the single-row
  helper used to do."
  [field-ids]
  (let [field-ids (into #{} (filter pos-int?) field-ids)
        rows      (when (seq field-ids)
                    (t2/select [:model/Field :id :name :display_name] :id [:in field-ids]))]
    (into {}
          (map (fn [{:keys [id name display_name]}]
                 [id {:id           id
                      :name         name
                      :display-name (or display_name name)}]))
          rows)))

(defn- predicate-field-ids
  "Return distinct field ids referenced in a decoded predicate."
  [predicate]
  (when predicate
    (try
      (vec (lib/all-field-ids predicate))
      (catch InterruptedException e
        (.interrupt (Thread/currentThread))
        (throw e))
      (catch Exception e
        (log/debugf "usage-metadata: predicate-field-ids failed: %s" (ex-message e))
        []))))

;; No SQL LIMIT here: callers filter saved-signature collisions in Clojure, so a SQL LIMIT can under-deliver.
(defn- grouped-segment-rows
  "Group + sum `source_segment_daily` counts for a source filter."
  [{:keys [source-type source-id bucket-start bucket-end]}]
  (let [where (cond-> [:and
                       [:in :ownership_mode ["direct" "projected"]]]
                source-type (conj [:= :source_type (name source-type)])
                source-id   (conj [:= :source_id source-id])
                bucket-start (conj [:>= :bucket_date bucket-start])
                bucket-end   (conj [:<= :bucket_date bucket-end]))]
    (t2/select [:model/SourceSegmentDaily
                :source_type
                :source_id
                :field_id
                :predicate
                [[:sum :count] :total_count]]
               {:where    where
                :group-by [:source_type :source_id :field_id :predicate]
                :order-by [[:total_count :desc]]})))

(defn- grouped-metric-rows
  "Group + sum `source_metric_daily` counts for a source filter."
  [{:keys [source-type source-id bucket-start bucket-end]}]
  (let [where (cond-> [:and
                       [:in :ownership_mode ["direct" "projected"]]]
                source-type (conj [:= :source_type (name source-type)])
                source-id   (conj [:= :source_id source-id])
                bucket-start (conj [:>= :bucket_date bucket-start])
                bucket-end   (conj [:<= :bucket_date bucket-end]))]
    (t2/select [:model/SourceMetricDaily
                :source_type
                :source_id
                :agg_type
                :agg_field_id
                :temporal_field_id
                :temporal_unit
                [[:sum :count] :total_count]]
               {:where    where
                :group-by [:source_type :source_id :agg_type :agg_field_id :temporal_field_id :temporal_unit]
                :order-by [[:total_count :desc]]})))

(defn- grouped-dimension-rows
  "Group + sum `source_dimension_daily` counts for a source filter."
  [{:keys [source-type source-id bucket-start bucket-end]}]
  (let [where (cond-> [:and
                       [:in :ownership_mode ["direct" "projected"]]]
                source-type (conj [:= :source_type (name source-type)])
                source-id   (conj [:= :source_id source-id])
                bucket-start (conj [:>= :bucket_date bucket-start])
                bucket-end   (conj [:<= :bucket_date bucket-end]))]
    (t2/select [:model/SourceDimensionDaily
                :source_type
                :source_id
                :field_id
                :temporal_unit
                :binning
                [[:sum :count] :total_count]]
               {:where    where
                :group-by [:source_type :source_id :field_id :temporal_unit :binning]
                :order-by [[:total_count :desc]]})))

(defn- decode-atom-fingerprints [x]
  (cond
    (sequential? x) (vec x)
    (string? x)     (vec (json/decode x))
    :else           []))

(defn- grouped-composite-rows
  "Group + sum `source_segment_composite_daily` counts for a source filter.

  Each returned row carries the whole-clause JSON, the atom-fingerprint array, and the summed count
  across the window — the input shape expected by the FIM pass."
  [{:keys [source-type source-id bucket-start bucket-end]}]
  (let [where (cond-> [:and
                       [:in :ownership_mode ["direct" "projected"]]]
                source-type  (conj [:= :source_type (name source-type)])
                source-id    (conj [:= :source_id source-id])
                bucket-start (conj [:>= :bucket_date bucket-start])
                bucket-end   (conj [:<= :bucket_date bucket-end]))]
    (->> (t2/select [:model/SourceSegmentCompositeDaily
                     :source_type
                     :source_id
                     :clause
                     :atom_fingerprints
                     :atom_count
                     [[:sum :count] :total_count]]
                    {:where    where
                     :group-by [:source_type :source_id :clause :atom_fingerprints :atom_count]
                     :order-by [[:total_count :desc]]})
         (mapv (fn [row]
                 (update row :atom_fingerprints decode-atom-fingerprints))))))

(defn- grouped-profile-rows
  "Group + sum `source_dimension_profile_daily` counts for a source filter."
  [{:keys [source-type source-id bucket-start bucket-end]}]
  (let [where (cond-> [:and]
                source-type (conj [:= :source_type (name source-type)])
                source-id   (conj [:= :source_id source-id])
                bucket-start (conj [:>= :bucket_date bucket-start])
                bucket-end   (conj [:<= :bucket_date bucket-end]))]
    (t2/select [:model/SourceDimensionProfileDaily
                :source_type
                :source_id
                :field_id
                :source_basis
                :observation_type
                :observation_value
                [[:sum :count] :total_count]]
               {:where    where
                :group-by [:source_type :source_id :field_id :source_basis :observation_type :observation_value]
                :order-by [[:total_count :desc]]})))

(defn- extract-facts
  [database-id query-map]
  (when-let [q (query-utils/wrap-query database-id query-map)]
    (try
      (usage-metadata.extract/extract-usage-facts q)
      (catch InterruptedException e
        (.interrupt (Thread/currentThread))
        (throw e))
      (catch Exception e
        (log/debugf "Failed to extract usage facts for usage-metadata insights: %s" (ex-message e))
        nil))))

(def ^:private cache-ttl-ms
  (* 60 1000))

(defn- existing-segment-facts*
  [[source-type source-id]]
  (let [where     (cond-> [:and [:= :archived false]]
                    (and (= source-type :table) source-id) (conj [:= :table_id source-id]))
        segments  (t2/select [:model/Segment :id :table_id :definition] {:where where})
        table-ids (into #{} (comp (keep :table_id) (filter pos-int?)) segments)
        table->db (when (seq table-ids)
                    (into {}
                          (map (juxt :id :db_id))
                          (t2/select [:model/Table :id :db_id] :id [:in table-ids])))]
    (lib-be/with-metadata-provider-cache
      (reduce (fn [result {:keys [table_id definition]}]
                (if-let [db-id (and (pos-int? table_id)
                                    (seq definition)
                                    (get table->db table_id))]
                  (let [{:keys [segments composites]} (extract-facts db-id definition)]
                    (-> result
                        (update :predicates into
                                (keep (fn [{:keys [predicate]}]
                                        (when predicate
                                          [:table table_id predicate])))
                                segments)
                        (update :composite-atomsets into
                                (keep (fn [{:keys [atom-fingerprints]}]
                                        (when (>= (count atom-fingerprints)
                                                  frequent-itemsets/minimum-itemset-size)
                                          [:table table_id (set atom-fingerprints)])))
                                composites)))
                  result))
              {:predicates #{}, :composite-atomsets #{}}
              segments))))

(defn- ttl-memoized
  [f]
  (memoize/ttl f :ttl/threshold cache-ttl-ms))

(def ^:private existing-segment-facts*-memo
  (ttl-memoized existing-segment-facts*))

(defn- existing-segment-predicates
  "Set of `[source-type source-id predicate-json]` tuples for non-archived Segments whose
  atomic filter clauses would collide with stored implicit segment predicates."
  [{:keys [source-type source-id]}]
  (:predicates (existing-segment-facts*-memo [source-type source-id])))

(defn- existing-metric-signatures*
  []
  (let [cards (t2/select [:model/Card :id :database_id :dataset_query :card_schema]
                         :type "metric"
                         :archived false)]
    (lib-be/with-metadata-provider-cache
      (into #{}
            (mapcat (fn [{:keys [database_id dataset_query]}]
                      (when (seq dataset_query)
                        (let [facts (:metrics (extract-facts database_id dataset_query))]
                          (for [{:keys [source-type source-id ownership-mode
                                        agg agg-field-id temporal-field-id temporal-unit]} facts
                                ;; only :direct signatures are comparable to stored rollup rows for this source
                                :when (and source-type (= ownership-mode :direct))]
                            [source-type source-id agg agg-field-id temporal-field-id temporal-unit])))))
            cards))))

(def ^:private existing-metric-signatures*-memo
  (ttl-memoized (fn [_] (existing-metric-signatures*))))

(defn- existing-metric-signatures
  "Set of `[source-type source-id agg-type agg-field-id temporal-field-id temporal-unit]`
  tuples for non-archived Metric cards (Cards of type `metric`). Scan is independent of opts;
  TTL-memoized with a singleton key."
  []
  (existing-metric-signatures*-memo ::all))

(mu/defn implicit-segments :- [:sequential ::usage-metadata.schema/implicit-segment]
  "Top implicit segments recorded across usage-metadata rollups.

  Predicates that correspond to *existing* saved Segments are filtered out — only truly
  ad-hoc filter patterns are returned."
  ([] (implicit-segments {}))
  ([{:keys [limit] :or {limit 10} :as opts} :- ::usage-metadata.schema/opts]
   (let [existing    (existing-segment-predicates opts)
         raw-rows    (remove (fn [{:keys [source_type source_id predicate]}]
                               (contains? existing [source_type source_id predicate]))
                             (grouped-segment-rows opts))
         ;; Decode each predicate + its field-ids in one pass so we can bulk-fetch below.
         enriched    (mapv (fn [{:keys [predicate] :as row}]
                             (let [decoded (decode-predicate predicate)]
                               (assoc row
                                      ::decoded   decoded
                                      ::field-ids (predicate-field-ids decoded))))
                           raw-rows)
         source-idx  (query-utils/build-source-index
                      (into #{} (map (juxt :source_type :source_id)) enriched))
         field-idx   (build-field-index
                      (into #{} (mapcat ::field-ids) enriched))]
     (into []
           (comp
            (keep (fn [row]
                    (when-let [source (source-idx [(:source_type row) (:source_id row)])]
                      (let [fields (into [] (keep field-idx) (::field-ids row))]
                        (when (seq fields)
                          {:predicate (::decoded row)
                           :source    source
                           :fields    fields
                           :count     (long (:total_count row))})))))
            (take limit))
           enriched))))

(mu/defn implicit-metrics :- [:sequential ::usage-metadata.schema/implicit-metric]
  "Top implicit metrics recorded across usage-metadata rollups.

  Aggregations that correspond to *existing* saved Metrics (Cards of type `metric`) are
  filtered out — only truly ad-hoc aggregation patterns are returned."
  ([] (implicit-metrics {}))
  ([{:keys [limit] :or {limit 10} :as opts} :- ::usage-metadata.schema/opts]
   (let [existing   (existing-metric-signatures)
         rows       (remove (fn [{:keys [source_type source_id agg_type agg_field_id temporal_field_id temporal_unit]}]
                              (contains? existing [source_type source_id agg_type agg_field_id temporal_field_id temporal_unit]))
                            (grouped-metric-rows opts))
         source-idx (query-utils/build-source-index
                     (into #{} (map (juxt :source_type :source_id)) rows))
         field-idx  (build-field-index
                     (into #{} (mapcat (juxt :agg_field_id :temporal_field_id)) rows))]
     (into []
           (comp
            (keep (fn [{:keys [source_type source_id agg_type agg_field_id temporal_field_id temporal_unit total_count]}]
                    (when-let [source (source-idx [source_type source_id])]
                      {:source      source
                       :aggregation {:type           agg_type
                                     :field          (field-idx agg_field_id)
                                     :temporal-field (field-idx temporal_field_id)
                                     :temporal-unit  temporal_unit}
                       :count       (long total_count)})))
            (take limit))
           rows))))

(mu/defn implicit-dimensions :- [:sequential ::usage-metadata.schema/implicit-dimension]
  "Top implicit dimensions recorded across usage-metadata rollups."
  ([] (implicit-dimensions {}))
  ([{:keys [limit] :or {limit 10} :as opts} :- ::usage-metadata.schema/opts]
   (let [rows       (grouped-dimension-rows opts)
         source-idx (query-utils/build-source-index
                     (into #{} (map (juxt :source_type :source_id)) rows))
         field-idx  (build-field-index
                     (into #{} (keep :field_id) rows))]
     (into []
           (comp
            (keep (fn [{:keys [source_type source_id field_id temporal_unit binning total_count]}]
                    (when-let [source (source-idx [source_type source_id])]
                      (when-let [field (field-idx field_id)]
                        {:source    source
                         :dimension {:field         field
                                     :temporal-unit temporal_unit
                                     :binning       (decode-binning binning)}
                         :count     (long total_count)}))))
            (take limit))
           rows))))

(defn- rebuild-and-clause
  [fingerprints]
  (let [atoms (into []
                    (keep decode-predicate)
                    fingerprints)]
    (when (>= (count atoms) frequent-itemsets/minimum-itemset-size)
      (lib/simplify-compound-filter (apply lib/and atoms)))))

(defn- existing-composite-atomsets
  "Set of `[source-type source-id #{atom-fingerprint ...}]` tuples for non-archived Segments whose
  definitions are whole-:and baskets. Used to filter out suggestions that already exist as saved Segments."
  [{:keys [source-type source-id]}]
  (:composite-atomsets (existing-segment-facts*-memo [source-type source-id])))

(mu/defn suggested-segments-for-owner :- [:sequential ::usage-metadata.schema/suggested-segment]
  "Suggest composite (`:and`) segment definitions that recur across a source's query history but
  have not been saved as Segments yet. Implemented as Apriori FIM over composite rollup baskets:
  each rollup row is a basket whose items are the atomic predicates of one stage's top-level `:and`.
  We mine closed frequent itemsets and reconstruct each surviving itemset as an `:and` MBQL clause.

  `:itemset-size` is bounded to 2..5. `:support` is the weighted count of
  baskets containing ALL of the itemset's atoms (basket weight = the rollup row's `:count`).
  `:support-ratio` is `support / any-atom-support` and is floored by the miner's relative-support threshold.

  Results are sorted by `:support` desc, then by `:itemset-size` desc — at equal support, larger
  recurring `:and`s rank higher, since they encode more user intent. Truncated to `:limit`."
  ([] (suggested-segments-for-owner {}))
  ([{:keys [limit] :or {limit frequent-itemsets/default-limit} :as opts} :- ::usage-metadata.schema/opts]
   (let [rows          (grouped-composite-rows opts)
         by-source     (group-by (juxt :source_type :source_id) rows)
         source-idx    (query-utils/build-source-index (keys by-source))
         candidates    (into []
                             (mapcat (fn [[[source-type source-id] source-rows]]
                                       (when-let [source (source-idx [source-type source-id])]
                                         (let [baskets  (frequent-itemsets/rows->baskets source-rows)
                                               existing (existing-composite-atomsets {:source-type source-type
                                                                                      :source-id   source-id})
                                               mined    (frequent-itemsets/mine-closed-itemsets baskets)]
                                           (for [[itemset-vec support] mined
                                                 :let  [itemset (set itemset-vec)]
                                                 :when (and (frequent-itemsets/relative-support-ok?
                                                             baskets itemset-vec support)
                                                            (not (contains? existing [source-type source-id itemset])))
                                                 :let  [clause (rebuild-and-clause itemset-vec)
                                                        denom  (frequent-itemsets/any-atom-support baskets itemset-vec)]
                                                 :when clause]
                                             {:clause        clause
                                              :itemset-size  (count itemset-vec)
                                              :source        source
                                              :support       support
                                              :support-ratio (if (pos? denom) (/ support (double denom)) 0.0)})))))
                             by-source)]
     (into []
           (take limit)
           (sort-by (juxt (comp - :support) (comp - :itemset-size)) candidates)))))

(mu/defn profile-observations :- [:sequential ::usage-metadata.schema/profile-observation]
  "Top dimension profile observations recorded across usage-metadata rollups."
  ([] (profile-observations {}))
  ([{:keys [limit] :or {limit 10} :as opts} :- ::usage-metadata.schema/opts]
   (let [rows       (grouped-profile-rows opts)
         source-idx (query-utils/build-source-index
                     (into #{} (map (juxt :source_type :source_id)) rows))
         field-idx  (build-field-index
                     (into #{} (keep :field_id) rows))]
     (into []
           (comp
            (keep (fn [{:keys [source_type source_id field_id source_basis
                               observation_type observation_value total_count]}]
                    (when-let [source (source-idx [source_type source_id])]
                      (when-let [field (field-idx field_id)]
                        {:source      source
                         :field       field
                         :basis       source_basis
                         :observation {:type  observation_type
                                       :value observation_value}
                         :count       (long total_count)}))))
            (take limit))
           rows))))
