(ns metabase.usage-metadata.insights
  "Read-side helpers over usage-metadata rollups — consumer of the batch pipeline."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
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

(defn- build-source-index
  "Bulk-fetch Table and Card rows for the `[source-type source-id]` tuples present in
  `source-keys` and return a map keyed by `[source-type source-id]`."
  [source-keys]
  (let [by-type   (group-by first source-keys)
        table-ids (into #{} (comp (keep second) (filter pos-int?)) (get by-type :table))
        card-ids  (into #{} (comp (keep second) (filter pos-int?)) (get by-type :card))
        tables    (when (seq table-ids)
                    (t2/select [:model/Table :id :name :display_name :db_id :schema]
                               :id [:in table-ids]))
        cards     (when (seq card-ids)
                    (t2/select [:model/Card :id :name] :id [:in card-ids]))]
    (into {}
          cat
          [(map (fn [{:keys [id name display_name db_id schema]}]
                  [[:table id] {:type         :table
                                :id           id
                                :db-id        db_id
                                :schema       schema
                                :name         name
                                :display-name (or display_name name)}])
                tables)
           (map (fn [{:keys [id name]}]
                  [[:card id] {:type         :card
                               :id           id
                               :name         name
                               :display-name name}])
                cards)])))

(defn- predicate-field-ids
  "Return distinct field ids referenced in a decoded predicate (handles both MBQL4 and MBQL5 field shapes)."
  [predicate]
  (when predicate
    (try
      (->> (lib.util.match/match-many predicate
             [(:or "field" :field) _opts (id :guard pos-int?)] id
             [(:or "field" :field) (id :guard pos-int?) _opts] id)
           distinct
           vec)
      (catch Throwable e
        (log/debug e "usage-metadata: predicate-field-ids match failed")
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

(defn- wrap-query
  "Wrap a raw MBQL map in a full lib query using the app DB metadata-provider. Returns nil on failure."
  [database-id query-map]
  (when (and (pos-int? database-id) (seq query-map))
    (try
      (lib/query (lib-be/application-database-metadata-provider database-id) query-map)
      (catch Throwable e
        (log/debug e "Failed to wrap query for usage-metadata insights")
        nil))))

(defn- extract-facts
  [database-id query-map]
  (when-let [q (wrap-query database-id query-map)]
    (try
      (usage-metadata.extract/extract-usage-facts q)
      (catch Throwable e
        (log/debug e "Failed to extract usage facts for usage-metadata insights")
        nil))))

(def ^:private cache-ttl-ms
  (* 60 1000))

(defn- existing-segment-predicates*
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
      (into #{}
            (mapcat (fn [{:keys [table_id definition]}]
                      (when (and (pos-int? table_id) (seq definition))
                        (when-let [db-id (get table->db table_id)]
                          (let [facts (:segments (extract-facts db-id definition))]
                            (for [{:keys [predicate]} facts
                                  :when predicate]
                              [:table table_id predicate]))))))
            segments))))

(def ^:private existing-segment-predicates*-memo
  (memoize/ttl existing-segment-predicates* :ttl/threshold cache-ttl-ms))

(defn- existing-segment-predicates
  "Set of `[source-type source-id predicate-json]` tuples for non-archived Segments whose
  atomic filter clauses would collide with stored implicit segment predicates."
  [{:keys [source-type source-id]}]
  (existing-segment-predicates*-memo [source-type source-id]))

(defn- existing-metric-signatures*
  []
  (let [cards (t2/select [:model/Card :id :database_id :dataset_query]
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
  (memoize/ttl (fn [_] (existing-metric-signatures*)) :ttl/threshold cache-ttl-ms))

(defn- existing-metric-signatures
  "Set of `[source-type source-id agg-type agg-field-id temporal-field-id temporal-unit]`
  tuples for non-archived Metric cards (Cards of type `metric`). Scan is independent of opts;
  TTL-memoized with a singleton key."
  []
  (existing-metric-signatures*-memo ::all))

(defn implicit-segments
  "Top implicit segments recorded across usage-metadata rollups.

  Predicates that correspond to *existing* saved Segments are filtered out — only truly
  ad-hoc filter patterns are returned.

  Returns a flat ranked sequence of:
    {:predicate <mbql-clause>
     :source {:type :id :name :display-name}
     :fields [{:id :name :display-name} ...]
     :count <long>}"
  ([]
   (implicit-segments {}))
  ([{:keys [limit] :or {limit 10} :as opts}]
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
         source-idx  (build-source-index
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
                           :count     (:total_count row)})))))
            (take limit))
           enriched))))

(defn implicit-metrics
  "Top implicit metrics recorded across usage-metadata rollups.

  Aggregations that correspond to *existing* saved Metrics (Cards of type `metric`) are
  filtered out — only truly ad-hoc aggregation patterns are returned."
  ([]
   (implicit-metrics {}))
  ([{:keys [limit] :or {limit 10} :as opts}]
   (let [existing   (existing-metric-signatures)
         rows       (remove (fn [{:keys [source_type source_id agg_type agg_field_id temporal_field_id temporal_unit]}]
                              (contains? existing [source_type source_id agg_type agg_field_id temporal_field_id temporal_unit]))
                            (grouped-metric-rows opts))
         source-idx (build-source-index
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
                       :count       total_count})))
            (take limit))
           rows))))

(defn implicit-dimensions
  "Top implicit dimensions recorded across usage-metadata rollups."
  ([]
   (implicit-dimensions {}))
  ([{:keys [limit] :or {limit 10} :as opts}]
   (let [rows       (grouped-dimension-rows opts)
         source-idx (build-source-index
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
                         :count     total_count}))))
            (take limit))
           rows))))

(def ^:private fim-absolute-support-floor 2)
(def ^:private fim-relative-support-floor 0.2)
(def ^:private fim-k-min 2)
(def ^:private fim-k-max 5)
(def ^:private fim-default-limit 20)

(defn- rows->baskets
  "Project rollup rows to `{:atoms #{...} :count n}` baskets for mining."
  [rows]
  (into []
        (keep (fn [{:keys [atom_fingerprints total_count]}]
                (when (>= (count atom_fingerprints) fim-k-min)
                  {:atoms (set atom_fingerprints)
                   :count total_count})))
        rows))

(defn- itemset-support
  [baskets itemset]
  (reduce (fn [acc {:keys [atoms count]}]
            (if (every? atoms itemset)
              (+ acc count)
              acc))
          0
          baskets))

(defn- any-atom-support
  "Number of baskets containing at least one atom of `itemset` (denominator for the relative support check)."
  [baskets itemset]
  (reduce (fn [acc {:keys [atoms count]}]
            (if (some atoms itemset)
              (+ acc count)
              acc))
          0
          baskets))

(defn- frequent-singletons
  [baskets absolute-floor]
  (let [counts (reduce (fn [m {:keys [atoms count]}]
                         (reduce (fn [m a] (update m a (fnil + 0) count)) m atoms))
                       {}
                       baskets)]
    (into {}
          (filter (fn [[_ n]] (>= n absolute-floor)))
          counts)))

(defn- apriori-join
  "Generate k+1 candidate itemsets by joining k-itemsets sharing a k-1 prefix."
  [lk-vecs]
  (let [by-prefix (group-by (fn [is] (subvec is 0 (dec (count is)))) lk-vecs)]
    (into #{}
          (mapcat (fn [group]
                    (for [a group
                          b group
                          :when (neg? (compare (peek a) (peek b)))]
                      (conj a (peek b)))))
          (vals by-prefix))))

(defn- has-all-k-subsets?
  [lk-set candidate]
  (let [n (count candidate)]
    (every? (fn [i]
              (let [sub (into (subvec candidate 0 i) (subvec candidate (inc i)))]
                (contains? lk-set sub)))
            (range n))))

(defn- mine-itemsets
  "Apriori up to size `fim-k-max`. Returns `{itemset-vec support}` for itemsets of size ≥ `fim-k-min`."
  [baskets]
  (let [singletons (frequent-singletons baskets fim-absolute-support-floor)
        l1-vecs    (vec (sort (map vector (keys singletons))))]
    (loop [lk       l1-vecs
           k        1
           acc      {}]
      (if (or (empty? lk) (>= k fim-k-max))
        acc
        (let [lk-set     (set lk)
              candidates (apriori-join lk)
              pruned     (into [] (filter (partial has-all-k-subsets? lk-set)) candidates)
              counted    (into {}
                               (keep (fn [c]
                                       (let [s (itemset-support baskets (set c))]
                                         (when (>= s fim-absolute-support-floor) [c s]))))
                               pruned)
              next-k     (inc k)
              acc        (if (>= next-k fim-k-min)
                           (merge acc counted)
                           acc)]
          (recur (vec (sort (keys counted))) next-k acc))))))

(defn- closed-only
  "Keep only itemsets that have no proper superset of equal support — the closed frequent itemsets."
  [itemset->support]
  (let [entries (vec itemset->support)]
    (into {}
          (remove (fn [[is sup]]
                    (let [is-set (set is)
                          is-n   (count is)]
                      (some (fn [[other other-sup]]
                              (and (= sup other-sup)
                                   (> (count other) is-n)
                                   (every? (set other) is-set)))
                            entries))))
          entries)))

(defn- relative-support-ok?
  [baskets itemset support]
  (let [denom (any-atom-support baskets itemset)]
    (or (zero? denom)
        (>= (/ support (double denom)) fim-relative-support-floor))))

(defn- rebuild-and-clause
  [fingerprints]
  (let [atoms (into []
                    (keep decode-predicate)
                    fingerprints)]
    (when (>= (count atoms) fim-k-min)
      (into [:and] atoms))))

(defn- existing-composite-atomsets*
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
      (into #{}
            (mapcat (fn [{:keys [table_id definition]}]
                      (when (and (pos-int? table_id) (seq definition))
                        (when-let [db-id (get table->db table_id)]
                          (let [facts (:composites (extract-facts db-id definition))]
                            (for [{:keys [atom-fingerprints]} facts
                                  :when (>= (count atom-fingerprints) fim-k-min)]
                              [:table table_id (set atom-fingerprints)]))))))
            segments))))

(def ^:private existing-composite-atomsets*-memo
  (memoize/ttl existing-composite-atomsets* :ttl/threshold cache-ttl-ms))

(defn- existing-composite-atomsets
  "Set of `[source-type source-id #{atom-fingerprint ...}]` tuples for non-archived Segments whose
  definitions are whole-:and baskets. Used to filter out suggestions that already exist as saved Segments."
  [{:keys [source-type source-id]}]
  (existing-composite-atomsets*-memo [source-type source-id]))

(defn suggested-segments-for-owner
  "Top implicit composite segment candidates for an owner — closed frequent itemsets (size 2..5) of
  atom fingerprints that recur above the absolute + relative support thresholds across composite
  rollup baskets in the window.

  Itemsets whose atom-set equals an existing non-archived Segment's definition are filtered out.

  Returns a ranked sequence of:
    {:clause <mbql :and clause>
     :atom-count <int>
     :source {:type :id :name :display-name}
     :support <long>        ; weighted basket count containing the itemset
     :support-ratio <double>; support / baskets-with-any-of-its-atoms
     :count <long>}"
  ([] (suggested-segments-for-owner {}))
  ([{:keys [limit] :or {limit fim-default-limit} :as opts}]
   (let [rows          (grouped-composite-rows opts)
         by-source     (group-by (juxt :source_type :source_id) rows)
         source-idx    (build-source-index (keys by-source))
         candidates    (into []
                             (mapcat (fn [[[source-type source-id] source-rows]]
                                       (when-let [source (source-idx [source-type source-id])]
                                         (let [baskets  (rows->baskets source-rows)
                                               existing (existing-composite-atomsets {:source-type source-type
                                                                                      :source-id   source-id})
                                               mined    (closed-only (mine-itemsets baskets))]
                                           (for [[itemset-vec support] mined
                                                 :let  [itemset (set itemset-vec)]
                                                 :when (and (relative-support-ok? baskets itemset-vec support)
                                                            (not (contains? existing [source-type source-id itemset])))
                                                 :let  [clause (rebuild-and-clause itemset-vec)
                                                        denom  (any-atom-support baskets itemset-vec)]
                                                 :when clause]
                                             {:clause        clause
                                              :atom-count    (count itemset-vec)
                                              :source        source
                                              :support       support
                                              :support-ratio (if (pos? denom) (/ support (double denom)) 0.0)
                                              :count         support})))))
                             by-source)]
     (into []
           (take limit)
           (sort-by (juxt (comp - :support) (comp - :atom-count)) candidates)))))

(defn profile-observations
  "Top dimension profile observations recorded across usage-metadata rollups."
  ([]
   (profile-observations {}))
  ([{:keys [limit] :or {limit 10} :as opts}]
   (let [rows       (grouped-profile-rows opts)
         source-idx (build-source-index
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
                         :count       total_count}))))
            (take limit))
           rows))))
