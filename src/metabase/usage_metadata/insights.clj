(ns metabase.usage-metadata.insights
  "Read-side helpers over usage-metadata rollups — consumer of the batch pipeline."
  (:require
   [clojure.core.memoize :as memoize]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.measure :as lib.schema.measure]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.usage-metadata.extract :as usage-metadata.extract]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.schema :as usage-metadata.schema]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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
  "Return distinct field ids referenced in a decoded predicate."
  [predicate]
  (when predicate
    (try
      (vec (lib/all-field-ids predicate))
      (catch Throwable e
        (log/debug e "usage-metadata: predicate-field-ids failed")
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

;;; ------------------------------------------------ Candidate mining ------------------------------------------------

(def ^:private candidate-default-min-view-count 10)
(def ^:private candidate-default-limit 50)
(def ^:private candidate-aggregation-operators #{:count :sum :avg :min :max :distinct})

(defn- canonical-signature
  "Canonical JSON used only for deterministic candidate grouping and exact collision checks."
  [x]
  (-> x
      lib.schema.util/remove-lib-uuids
      (lib.schema.util/sorted-maps lib.schema.common/unfussy-sorted-map)
      json/encode))

(defn- candidate-source-cards
  [{:keys [min-view-count]}]
  (let [min-view-count (or min-view-count candidate-default-min-view-count)
        cards          (t2/select [:model/Card :id :name :type :database_id :dataset_query :card_schema
                                   :collection_id :view_count]
                                  :archived false
                                  :type [:in [:question :model]])
        card-ids       (into #{} (map :id) cards)
        collection-ids (into #{} (keep :collection_id) cards)
        verified-ids   (if (seq card-ids)
                         (t2/select-fn-set :moderated_item_id :model/ModerationReview
                                           :moderated_item_id [:in card-ids]
                                           :moderated_item_type "card"
                                           :most_recent true
                                           :status "verified")
                         #{})
        official-ids   (if (seq collection-ids)
                         (t2/select-pks-set :model/Collection
                                            :id [:in collection-ids]
                                            :authority_level "official")
                         #{})]
    (->> cards
         (map (fn [{:keys [id collection_id view_count] :as card}]
                (let [view-count (long (or view_count 0))]
                  (assoc card
                         :verified?            (contains? verified-ids id)
                         :official-collection? (contains? official-ids collection_id)
                         :popular?             (>= view-count min-view-count)
                         :view-count           view-count))))
         (filter (some-fn :verified? :official-collection? :popular?))
         (sort-by :id)
         vec)))

(defn- simple-physical-table-query
  [database-id dataset-query]
  (when-let [query (wrap-query database-id dataset-query)]
    (let [stage (when (= 1 (lib/stage-count query))
                  (lib/query-stage query 0))]
      (when (and (= :mbql.stage/mbql (:lib/type stage))
                 (pos-int? (:source-table stage))
                 (not (seq (:joins stage)))
                 (not (seq (:expressions stage))))
        {:query query
         :table-id (:source-table stage)}))))

(defn- minimal-definition
  [query table-id clause-key clause]
  {:lib/type :mbql/query
   :database (:database query)
   :stages   [(assoc {:lib/type     :mbql.stage/mbql
                      :source-table table-id}
                     clause-key [clause])]})

(defn- direct-columns
  [query clause table-id]
  (try
    (let [columns (vec (distinct (lib/referenced-columns query 0 clause)))]
      (when (and (seq columns)
                 (every? #(and (pos-int? (:id %)) (= table-id (:table-id %))) columns))
        columns))
    (catch Throwable e
      (log/debug e "Failed to resolve candidate fields")
      nil)))

(defn- field-summary
  [{:keys [id name display-name]}]
  {:id           id
   :name         name
   :display-name (or display-name name)})

(defn- simple-aggregation
  [query aggregation table-id]
  (let [operator (first aggregation)]
    (when (and (contains? candidate-aggregation-operators operator)
               (if (= operator :count)
                 (= 2 (count aggregation))
                 (and (= 3 (count aggregation))
                      (lib/clause-of-type? (nth aggregation 2) :field))))
      (let [columns (if (= operator :count)
                      []
                      (direct-columns query aggregation table-id))]
        (when (or (= operator :count) (= 1 (count columns)))
          {:type  operator
           :field (some-> (first columns) field-summary)})))))

(defn- segment-signature
  [table-id predicates]
  [table-id (vec (sort (map canonical-signature predicates)))])

(defn- source-item-evidence
  [{:keys [id name type verified? official-collection? popular? view-count]}]
  {:id                   id
   :name                 name
   :type                 type
   :verified?            verified?
   :official-collection? official-collection?
   :popular?             popular?
   :view-count           view-count})

(defn- candidate-evidence
  [source-items]
  (let [items (->> source-items (map source-item-evidence) (sort-by :id) distinct vec)]
    {:source-items          items
     :distinct-source-count (count items)
     :verified-source-count (count (filter :verified? items))
     :official-source-count (count (filter :official-collection? items))
     :popular-source-count  (count (filter :popular? items))
     :total-view-count      (reduce + 0 (map :view-count items))}))

(defn- candidate-sort-key
  [{:keys [atom-count evidence], signature ::signature}]
  [(if (pos? (:verified-source-count evidence)) 0 1)
   (if (pos? (:official-source-count evidence)) 0 1)
   (- (:distinct-source-count evidence))
   (or atom-count 0)
   (- (:total-view-count evidence))
   signature])

(defn- merge-candidates
  ([raw-candidates source-index existing-signatures limit]
   (merge-candidates raw-candidates source-index existing-signatures limit (constantly true)))
  ([raw-candidates source-index existing-signatures limit keep-candidate?]
   (->> raw-candidates
        (remove #(contains? existing-signatures (::signature %)))
        (group-by ::signature)
        (keep (fn [[signature candidates]]
                (let [candidate (first candidates)]
                  (when-let [source (source-index [:table (::table-id candidate)])]
                    (let [candidate (-> candidate
                                        (assoc :source source
                                               :evidence (candidate-evidence (map ::source-item candidates))
                                               ::signature signature)
                                        (dissoc ::table-id ::source-item))]
                      (when (keep-candidate? candidate)
                        candidate))))))
        (sort-by candidate-sort-key)
        (take limit)
        (mapv #(dissoc % ::signature)))))

(defn- raw-measure-candidates
  [cards]
  (into []
        (mapcat
         (fn [{:keys [database_id dataset_query] :as card}]
           (when-let [{:keys [query table-id]} (simple-physical-table-query database_id dataset_query)]
             (for [aggregation (lib/aggregations query 0)
                   :let [aggregation-info (simple-aggregation query aggregation table-id)]
                   :when aggregation-info
                   :let [definition (minimal-definition query table-id :aggregation aggregation)]
                   :when (mr/validate ::lib.schema.measure/definition definition)]
               {::signature  [table-id (canonical-signature aggregation)]
                ::table-id   table-id
                ::source-item card
                :definition  definition
                :aggregation aggregation-info}))))
        cards))

(defn- full-segment-predicate
  [definition]
  (when-let [filters (seq (lib/filters definition 0))]
    (if (next filters)
      (lib/simplify-compound-filter (apply lib/and filters))
      (first filters))))

(defn- existing-measure-signatures
  []
  (into #{}
        (keep (fn [{:keys [table_id definition]}]
                (when (and (pos-int? table_id) (seq definition))
                  (try
                    (let [aggregations (lib/aggregations definition 0)]
                      (when (= 1 (count aggregations))
                        [table_id (canonical-signature (first aggregations))]))
                    (catch Throwable e
                      (log/debug e "Failed to read an existing Measure definition")
                      nil)))))
        (t2/select [:model/Measure :table_id :definition] :archived false)))

(defn- existing-segment-signatures
  []
  (into #{}
        (keep (fn [{:keys [table_id definition]}]
                (when (and (pos-int? table_id) (seq definition))
                  (try
                    (when-let [predicate (full-segment-predicate definition)]
                      (let [atoms (lib/atomic-filters
                                   (minimal-definition definition table_id :filters predicate)
                                   0)]
                        (when (seq atoms)
                          (segment-signature table_id atoms))))
                    (catch Throwable e
                      (log/debug e "Failed to read an existing Segment definition")
                      nil)))))
        (t2/select [:model/Segment :table_id :definition] :archived false)))

(defn- combinations
  "Return all `k`-element combinations of `xs`, preserving input order inside each combination."
  [k xs]
  (cond
    (zero? k)      [[]]
    (empty? xs)    []
    (> k (count xs)) []
    :else
    (concat (map #(into [(first xs)] %) (combinations (dec k) (rest xs)))
            (combinations k (rest xs)))))

(defn- segment-subsets
  "Return all atom subsets of size 2..n. Callers bound n to five, so exhaustive enumeration is small."
  [atoms]
  (mapcat #(combinations % atoms) (range 2 (inc (count atoms)))))

(defn- raw-segment-candidates
  [cards]
  (into []
        (mapcat
         (fn [{:keys [database_id dataset_query] :as card}]
           (when-let [{:keys [query table-id]} (simple-physical-table-query database_id dataset_query)]
             (let [atoms (into []
                               (keep (fn [predicate]
                                       (when-let [columns (direct-columns query predicate table-id)]
                                         {:predicate predicate
                                          :columns   columns})))
                               (lib/atomic-filters query 0))
                   atom-candidates (mapv #(assoc % :predicates [(:predicate %)]) atoms)
                   composite-candidates
                   (when (<= 2 (count atoms) 5)
                     (for [subset (segment-subsets atoms)]
                       {:predicate  (lib/simplify-compound-filter
                                     (apply lib/and (map :predicate subset)))
                        :predicates (mapv :predicate subset)
                        :columns    (vec (distinct (mapcat :columns subset)))}))
                   candidates (into atom-candidates composite-candidates)]
               (for [{:keys [predicate predicates columns]} candidates
                     :let [definition (minimal-definition query table-id :filters predicate)]
                     :when (mr/validate ::lib.schema/query definition)]
                 {::signature  (segment-signature table-id predicates)
                  ::table-id   table-id
                  ::source-item card
                  :definition  definition
                  :predicate   predicate
                  :fields      (mapv field-summary columns)
                  :composite?  (> (count predicates) 1)
                  :atom-count  (count predicates)})))))
        cards))

(defn- eligible-segment-candidate?
  [{:keys [composite? evidence]}]
  (or (not composite?)
      (pos? (:verified-source-count evidence))
      (pos? (:official-source-count evidence))
      (>= (:distinct-source-count evidence) 2)))

(mu/defn candidate-measures :- [:sequential ::usage-metadata.schema/candidate-measure]
  "Creation-ready Measure candidates mined from qualifying questions and models.

  A source qualifies when it is verified, directly in an official collection, or has at least
  `:min-view-count` lifetime views. Only primitive aggregations over one physical-table field are
  considered; native queries, source cards, joins, expressions, and existing exact Measures are skipped."
  ([] (candidate-measures {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [limit      (or limit candidate-default-limit)
           cards      (candidate-source-cards opts)
           candidates (raw-measure-candidates cards)
           source-idx (build-source-index (into #{} (map (comp #(vector :table %) ::table-id)) candidates))]
       (merge-candidates candidates source-idx (existing-measure-signatures) limit)))))

(mu/defn candidate-segments :- [:sequential ::usage-metadata.schema/candidate-segment]
  "Creation-ready Segment candidates mined from qualifying questions and models.

  Each eligible direct-table filter becomes an atomic candidate. Queries with two to five eligible
  atoms also contribute every multi-atom subset. A composite is retained when it recurs across at
  least two source Cards or has verified/official evidence. Existing exact Segment definitions are
  skipped without allowing a saved conjunction to suppress its atomic constituents."
  ([] (candidate-segments {}))
  ([{:keys [limit] :as opts} :- ::usage-metadata.schema/candidate-opts]
   (lib-be/with-metadata-provider-cache
     (let [limit       (or limit candidate-default-limit)
           cards       (candidate-source-cards opts)
           candidates  (raw-segment-candidates cards)
           source-idx  (build-source-index (into #{} (map (comp #(vector :table %) ::table-id)) candidates))]
       (merge-candidates candidates
                         source-idx
                         (existing-segment-signatures)
                         limit
                         eligible-segment-candidate?)))))

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
  (memoize/ttl (fn [_] (existing-metric-signatures*)) :ttl/threshold cache-ttl-ms))

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
                       :count       (long total_count)})))
            (take limit))
           rows))))

(mu/defn implicit-dimensions :- [:sequential ::usage-metadata.schema/implicit-dimension]
  "Top implicit dimensions recorded across usage-metadata rollups."
  ([] (implicit-dimensions {}))
  ([{:keys [limit] :or {limit 10} :as opts} :- ::usage-metadata.schema/opts]
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
                         :count     (long total_count)}))))
            (take limit))
           rows))))

(def ^:private fim-absolute-support-floor 2)
(def ^:private fim-relative-support-floor 0.2)
(def ^:private fim-k-min 2)
(def ^:private fim-k-max 5)
(def ^:private fim-default-limit 20)

(defn- rows->baskets
  "Project rollup rows to `{:atoms #{...} :count n}` baskets for mining.

  Coerces `total_count` to `long` so downstream FIM math (and the `:support` field) stays
  integer — MariaDB/MySQL return `SUM(int_col)` as `BigDecimal`."
  [rows]
  (into []
        (keep (fn [{:keys [atom_fingerprints total_count]}]
                (when (>= (count atom_fingerprints) fim-k-min)
                  {:atoms (set atom_fingerprints)
                   :count (long total_count)})))
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
      (lib/simplify-compound-filter (apply lib/and atoms)))))

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

(mu/defn suggested-segments-for-owner :- [:sequential ::usage-metadata.schema/suggested-segment]
  "Suggest composite (`:and`) segment definitions that recur across a source's query history but
  have not been saved as Segments yet. Implemented as Apriori FIM over composite rollup baskets:
  each rollup row is a basket whose items are the atomic predicates of one stage's top-level `:and`.
  We mine closed frequent itemsets and reconstruct each surviving itemset as an `:and` MBQL clause.

  `:itemset-size` is bounded by `fim-k-min`/`fim-k-max` (2..5). `:support` is the weighted count of
  baskets containing ALL of the itemset's atoms (basket weight = the rollup row's `:count`).
  `:support-ratio` is `support / any-atom-support` and is floored by `fim-relative-support-floor`.

  Results are sorted by `:support` desc, then by `:itemset-size` desc — at equal support, larger
  recurring `:and`s rank higher, since they encode more user intent. Truncated to `:limit`."
  ([] (suggested-segments-for-owner {}))
  ([{:keys [limit] :or {limit fim-default-limit} :as opts} :- ::usage-metadata.schema/opts]
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
                         :count       (long total_count)}))))
            (take limit))
           rows))))
