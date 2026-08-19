(ns metabase.usage-metadata.candidate-snapshot
  "Materialization, reconciliation, and retirement of candidate snapshots."
  (:require
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.candidate-family :as candidate-family]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.candidate-repository :as candidate-repository]
   [metabase.usage-metadata.models.candidate]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:const signature-version
  "Version of the canonical identity used by durable dismissals."
  1)

(def source-config
  "Mining inputs and fixed evidence cutoffs recorded on every snapshot run."
  {:kind :qualified-cards
   :usage-window-days 90
   :minimum-recent-view-count 10
   :candidate-cutoffs
   {:verified {:minimum-total-view-count 10}
    :official {:minimum-distinct-source-count 2
               :minimum-total-view-count      10}
    :general  {:minimum-distinct-source-count 3
               :minimum-total-view-count      25}}})

(def ^:private retained-run-count 20)
(def ^:private source-card-batch-size 100)
(def ^:private persistence-write-batch-size 500)
(def ^:private reconciliation-query-batch-size 200)
(def ^:private prune-batch-size 200)
(def ^:private max-prune-batches-per-run 25)
(def ^:private reconciliation-write-batch-size 1000)

(defn- sha256
  ^String [^String value]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes value StandardCharsets/UTF_8))]
    (apply str (map #(format "%02x" (bit-and % 0xff)) digest))))

(defn- usable-table-index
  [table-ids]
  (let [tables (when (seq table-ids)
                 (t2/select [:model/Table :id :db_id :schema :name :display_name :description
                             :data_layer :data_authority :view_count :active :visibility_type
                             :is_published :collection_id]
                            {:where [:and
                                     [:in :id table-ids]
                                     [:= :active true]
                                     [:= :visibility_type nil]
                                     [:or [:= :data_layer nil]
                                      [:not= :data_layer "hidden"]]]}))
        db-ids (into #{} (keep :db_id) tables)
        dbs     (when (seq db-ids)
                  (u/index-by :id
                              (t2/select [:model/Database :id :name :is_audit :is_sample :router_database_id]
                                         :id [:in db-ids])))]
    (into {}
          (keep (fn [{:keys [id db_id] :as table}]
                  (let [database (dbs db_id)]
                    (when (and database
                               (not (:is_audit database))
                               (not (:is_sample database))
                               (nil? (:router_database_id database)))
                      [id (assoc table :database database)]))))
          tables)))

(defn- observation-table-id
  [observation]
  (get-in observation [:source :id]))

(defn- table-candidate-observation
  [{:keys [table evidence]}]
  (let [table-id (:id table)]
    {:candidate-type        :table
     :source                {:id table-id}
     :signature             (candidate-mining/canonical-signature [:publish-table table-id])
     :definition            {:table-id table-id}
     :semantic-details      {:table table
                             :source-dependencies
                             (mapv (fn [{:keys [id dependency-paths]}]
                                     {:card-id id, :dependency-paths dependency-paths})
                                   (:source-items evidence))}
     :suggested-name        (trs "Publish {0}" (:display-name table))
     :suggested-description (trs "Saved content depends on this unpublished table.")
     :evidence              (update evidence :source-items
                                    (fn [source-items]
                                      (mapv #(assoc % :joined? false, :stage-numbers [0]) source-items)))}))

(defn- metric-primary-table-id
  [{:keys [definition required-tables]}]
  (or (some-> definition lib/normalize lib/primary-source-table-id)
      (:id (first required-tables))))

(defn- metric-candidate-observation
  [{:keys [definition aggregation temporal-breakout required-tables evidence
           suggested-name suggested-description] :as metric}]
  (when-let [table-id (metric-primary-table-id metric)]
    {:candidate-type        :metric
     :source                {:id table-id}
     :signature             (candidate-mining/canonical-signature definition)
     :definition            definition
     :semantic-details      (cond-> {:aggregation aggregation
                                     :required-tables required-tables}
                              temporal-breakout (assoc :temporal-breakout temporal-breakout))
     :suggested-name        suggested-name
     :suggested-description suggested-description
     :evidence              evidence}))

(defn- observation-row
  [run-id observation]
  (let [{:keys [verified-source-count official-source-count popular-source-count
                distinct-source-count total-view-count]} (:evidence observation)
        type           (:candidate-type observation)
        complexity     (case type
                         :segment (:atom-count observation)
                         :measure (or (get-in observation [:aggregation :condition-atom-count]) 0)
                         :metric  (count (get-in observation [:definition :stages 0 :filters]))
                         :table   0)
        signature      (:signature observation)
        signature-hash (sha256 signature)]
    {:run_id                 run-id
     :candidate_type         type
     :table_id               (observation-table-id observation)
     :signature_version      signature-version
     :signature_hash         signature-hash
     :signature              signature
     :definition             (:definition observation)
     :semantic_details       (case type
                               :measure (:aggregation observation)
                               :segment (select-keys observation [:predicate :fields :atoms :composite? :atom-count])
                               (:metric :table) (:semantic-details observation))
     :suggested_name         (:suggested-name observation)
     :display_name           (:suggested-name observation)
     :suggested_description  (:suggested-description observation)
     :modeling_status        :missing
     :verified_source_count  verified-source-count
     :official_source_count  official-source-count
     :popular_source_count   popular-source-count
     :distinct_source_count  distinct-source-count
     :recent_view_count      total-view-count
     :complexity             complexity
     :sort_position          0}))

(defn- source-row
  [candidate-id source]
  {:candidate_id      candidate-id
   :card_id           (:id source)
   :card_name         (:name source)
   :card_type         (:type source)
   :verified          (:verified? source)
   :official          (:official-collection? source)
   :popular           (:popular? source)
   :recent_view_count (:view-count source)
   :joined            (:joined? source)
   :stage_numbers     (:stage-numbers source)
   :model_lineage     (:model-lineage source)})

(defn- candidate-reconciliation
  [{:keys [candidate_type table_id] :as candidate} published? existing-entities]
  (if-let [relation-fn (case candidate_type
                         :measure definitions/relation-for-measure
                         :segment definitions/relation-for-segment
                         nil)]
    (let [candidate (if (and published? (seq existing-entities))
                      (definitions/reconciliation-entity candidate_type table_id candidate)
                      candidate)
          matches   (when (and published? (seq existing-entities))
                      (keep (fn [entity]
                              (when-let [relation (relation-fn candidate entity)]
                                {:relation relation, :entity entity}))
                            existing-entities))
          status    (cond
                      (some #(= :exact (:relation %)) matches) :modeled
                      (seq matches)                            :partially-modeled
                      :else                                    :missing)]
      {:candidate candidate
       :status status
       :match-rows (mapv (fn [{:keys [relation entity]}]
                           (candidate-repository/candidate-match-row candidate entity relation))
                         matches)})
    {:candidate candidate, :status :missing, :match-rows []}))

(defn- published-table-ids
  [table-ids]
  (into #{}
        (mapcat (fn [ids]
                  (map :id (t2/select [:model/Table :id]
                                      :id [:in ids]
                                      :is_published true))))
        (partition-all reconciliation-query-batch-size table-ids)))

(defn reconcile-candidates!
  "Reconcile all Measure and Segment candidates in `run-id` using one indexed Library-entity population.

  Existing definitions are selected and normalized once per `[candidate-type table-id]`. Match rows and status updates
  are written in bounded batches."
  [run-id]
  (let [candidates          (t2/select [:model/UsageMetadataCandidate
                                        :id :candidate_type :table_id :signature :definition]
                                       :run_id run-id
                                       :candidate_type [:in [:measure :segment]])
        published-table-ids (published-table-ids (into #{} (map :table_id) candidates))
        candidate-keys      (into #{}
                                  (comp (filter #(contains? published-table-ids (:table_id %)))
                                        (map (juxt :candidate_type :table_id)))
                                  candidates)
        existing-index      (candidate-repository/existing-entity-index candidate-keys)
        reconciliations     (mapv (fn [{:keys [candidate_type table_id] :as candidate}]
                                    (candidate-reconciliation
                                     candidate
                                     (contains? published-table-ids table_id)
                                     (get existing-index [candidate_type table_id] [])))
                                  candidates)]
    (doseq [match-rows (->> reconciliations
                            (mapcat :match-rows)
                            (partition-all reconciliation-write-batch-size))]
      (t2/insert! :model/UsageMetadataCandidateMatch match-rows))
    (doseq [[status status-reconciliations] (group-by :status reconciliations)
            candidate-ids (->> status-reconciliations
                               (map (comp :id :candidate))
                               (partition-all reconciliation-write-batch-size))]
      (t2/update! :model/UsageMetadataCandidate :id [:in candidate-ids] {:modeling_status status}))
    nil))

(defn- merged-source-dependencies
  [candidate observation]
  (->> (concat (get-in candidate [:semantic_details :source-dependencies])
               (get-in observation [:semantic-details :source-dependencies]))
       (group-by :card-id)
       (map (fn [[card-id dependencies]]
              {:card-id card-id
               :dependency-paths (->> dependencies (mapcat :dependency-paths) distinct vec)}))
       (sort-by :card-id)
       vec))

(defn- merged-evidence
  [candidate observation]
  (let [{:keys [verified-source-count official-source-count popular-source-count
                distinct-source-count total-view-count]} (:evidence observation)]
    (cond-> {:verified_source_count (+ (:verified_source_count candidate) verified-source-count)
             :official_source_count (+ (:official_source_count candidate) official-source-count)
             :popular_source_count  (+ (:popular_source_count candidate) popular-source-count)
             :distinct_source_count (+ (:distinct_source_count candidate) distinct-source-count)
             :recent_view_count      (+ (:recent_view_count candidate) total-view-count)}
      (= :table (:candidate_type candidate))
      (assoc :semantic_details
             (assoc (:semantic_details candidate)
                    :source-dependencies (merged-source-dependencies candidate observation))))))

(defn- candidate-key
  [{:keys [candidate_type table_id signature_version signature_hash]}]
  [candidate_type table_id signature_version signature_hash])

(defn- select-candidates
  [run-id signature-hashes]
  (into []
        (mapcat (fn [hashes]
                  (t2/select :model/UsageMetadataCandidate
                             :run_id run-id
                             :signature_hash [:in hashes])))
        (partition-all persistence-write-batch-size signature-hashes)))

(defn- case-by-id
  [column updates value-fn]
  (into [:case]
        (concat (mapcat (fn [{:keys [candidate values]}]
                          [[:= :id (:id candidate)] (value-fn values)])
                        updates)
                [:else column])))

(defn- update-existing-evidence!
  [updates]
  (doseq [batch (partition-all persistence-write-batch-size updates)]
    (let [semantic-updates (filter #(contains? (:values %) :semantic_details) batch)]
      (t2/query
       {:update (t2/table-name :model/UsageMetadataCandidate)
        :set    (cond-> {:verified_source_count (case-by-id :verified_source_count batch :verified_source_count)
                         :official_source_count (case-by-id :official_source_count batch :official_source_count)
                         :popular_source_count  (case-by-id :popular_source_count batch :popular_source_count)
                         :distinct_source_count (case-by-id :distinct_source_count batch :distinct_source_count)
                         :recent_view_count      (case-by-id :recent_view_count batch :recent_view_count)}
                  (seq semantic-updates)
                  (assoc :semantic_details
                         (case-by-id :semantic_details semantic-updates
                                     (comp mi/json-in :semantic_details))))
        :where  [:in :id (mapv (comp :id :candidate) batch)]}))))

(defn- persist-observations!
  [run-id observations]
  (let [prepared       (mapv (fn [observation]
                               (let [row (observation-row run-id observation)]
                                 {:observation observation, :row row, :key (candidate-key row)}))
                             observations)
        keys           (mapv :key prepared)
        _              (when-not (= (count keys) (count (distinct keys)))
                         (throw (ex-info "Candidate batch contains duplicate observations" {})))
        signature-hashes (into #{} (map (comp :signature_hash :row)) prepared)
        existing       (select-candidates run-id signature-hashes)
        existing-index (u/index-by candidate-key existing)
        _              (doseq [{:keys [key row]} prepared
                               :let [candidate (existing-index key)]
                               :when (and candidate (not= (:signature candidate) (:signature row)))]
                         (throw (ex-info "Candidate signature hash collision"
                                         {:candidate-id (:id candidate)})))
        missing        (remove #(contains? existing-index (:key %)) prepared)]
    (doseq [rows (->> missing (map :row) (partition-all persistence-write-batch-size))]
      (t2/insert! :model/UsageMetadataCandidate rows))
    (let [candidate-index (u/index-by candidate-key (select-candidates run-id signature-hashes))
          source-rows     (for [{:keys [key observation]} prepared
                                :let [candidate (candidate-index key)]
                                source (get-in observation [:evidence :source-items])]
                            (source-row (:id candidate) source))
          updates         (keep (fn [{:keys [key observation]}]
                                  (when-let [candidate (existing-index key)]
                                    {:candidate candidate
                                     :values (merged-evidence candidate observation)}))
                                prepared)]
      (doseq [rows (partition-all persistence-write-batch-size source-rows)]
        (t2/insert! :model/UsageMetadataCandidateSource rows))
      (update-existing-evidence! updates))))

(defn- persist-card-batch!
  [run-id analysis-inputs card-ids]
  (let [opts {:card-ids (set card-ids)
              :min-view-count (:minimum-recent-view-count source-config)
              :view-count-window-days (:usage-window-days source-config)
              :include-ineligible? true}
        {:keys [cleanup table-report metrics]}
        (candidate-builders/candidate-batch-observations analysis-inputs opts)
        observations (concat (:measures cleanup)
                             (:segments cleanup)
                             (map table-candidate-observation (:candidates table-report))
                             (keep metric-candidate-observation metrics))
        tables       (usable-table-index (into #{} (map observation-table-id) observations))
        observations (filter #(contains? tables (observation-table-id %)) observations)]
    (t2/with-transaction [_conn]
      (persist-observations! run-id observations))))

(defn globally-eligible?
  "Whether an aggregated persisted candidate meets semantic and evidence cutoffs."
  [candidate]
  (let [{:keys [verified_source_count official_source_count distinct_source_count recent_view_count]}
        candidate
        cutoffs (:candidate-cutoffs source-config)
        {verified-min-views :minimum-total-view-count} (:verified cutoffs)
        {official-min-sources :minimum-distinct-source-count
         official-min-views   :minimum-total-view-count} (:official cutoffs)
        {general-min-sources :minimum-distinct-source-count
         general-min-views   :minimum-total-view-count} (:general cutoffs)]
    (and
     (candidate-mining/semantically-eligible-candidate?
      (definitions/candidate-row->observation candidate))
     (or (and (pos? verified_source_count)
              (>= recent_view_count verified-min-views))
         (and (pos? official_source_count)
              (>= distinct_source_count official-min-sources)
              (>= recent_view_count official-min-views))
         (and (>= distinct_source_count general-min-sources)
              (>= recent_view_count general-min-views))))))

(defn prune-ineligible-candidates!
  "Delete candidates that do not meet semantic or evidence thresholds."
  [run-id]
  (loop [last-id 0]
    (let [rows (t2/select [:model/UsageMetadataCandidate :id :candidate_type :semantic_details
                           :complexity :verified_source_count :official_source_count
                           :distinct_source_count :recent_view_count]
                          :run_id run-id
                          :id [:> last-id]
                          {:order-by [[:id :asc]], :limit 200})]
      (when (seq rows)
        (let [candidate-ids (into [] (comp (remove globally-eligible?) (map :id)) rows)]
          (when (seq candidate-ids)
            (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids])))
        (recur (long (:id (peek rows))))))))

(defn source-provenance-index
  "Load and normalize provenance rows keyed by candidate id."
  [candidate-ids]
  (let [sources (->> candidate-ids
                     (partition-all 200)
                     (mapcat (fn [ids]
                               (t2/select [:model/UsageMetadataCandidateSource
                                           :candidate_id :card_id :card_name :card_type
                                           :verified :official :popular :recent_view_count :joined
                                           :stage_numbers :model_lineage]
                                          :candidate_id [:in ids])))
                     (group-by :candidate_id))]
    (update-vals sources
                 (fn [candidate-sources]
                   (->> candidate-sources
                        (map #(dissoc % :candidate_id))
                        (sort-by :card_id)
                        vec)))))

(defn- non-closed-candidate-ids
  [candidates provenance-index candidate-details]
  (->> candidates
       (keep (fn [candidate]
               (when-let [{:keys [atoms domain]} (candidate-details candidate)]
                 (assoc candidate
                        ::atoms atoms
                        ::domain domain
                        ::provenance (get provenance-index (:id candidate))))))
       (group-by (juxt :table_id ::domain ::provenance))
       (keep (fn [[[_table-id _domain provenance] candidates]]
               (when (seq provenance)
                 (for [{candidate-id :id, candidate-atoms ::atoms} candidates
                       :when (some (fn [{other-id :id, other-atoms ::atoms}]
                                     (and (not= candidate-id other-id)
                                          (< (count candidate-atoms) (count other-atoms))
                                          (set/subset? candidate-atoms other-atoms)))
                                   candidates)]
                   candidate-id))))
       (into #{} cat)))

(defn non-closed-segment-candidate-ids
  "Find Segment subsets with exactly the same source provenance as a stricter candidate."
  [candidates provenance-index]
  (non-closed-candidate-ids
   candidates provenance-index
   (fn [candidate]
     {:atoms (definitions/segment-atoms (:definition candidate)), :domain nil})))

(defn non-closed-measure-candidate-ids
  "Find conditional Measure subsets with exactly the same source provenance as a stricter candidate."
  [candidates provenance-index]
  (non-closed-candidate-ids
   candidates provenance-index
   (fn [candidate]
     (when-let [atoms (not-empty (definitions/measure-condition-atoms (:definition candidate)))]
       {:atoms atoms, :domain (definitions/measure-base (:definition candidate))}))))

(defn- prune-non-closed-candidates!
  [run-id candidate-type candidate-ids-fn]
  (let [candidates       (t2/select [:model/UsageMetadataCandidate :id :table_id :definition]
                                    :run_id run-id
                                    :candidate_type candidate-type)
        provenance-index (source-provenance-index (map :id candidates))
        candidate-ids    (candidate-ids-fn candidates provenance-index)]
    (when (seq candidate-ids)
      (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids]))))

(defn- prune-non-closed-segment-candidates!
  [run-id]
  (prune-non-closed-candidates! run-id :segment non-closed-segment-candidate-ids))

(defn- prune-non-closed-measure-candidates!
  [run-id]
  (prune-non-closed-candidates! run-id :measure non-closed-measure-candidate-ids))

(defn- run-summary
  [run-id]
  (let [{:keys [table_count]}
        (t2/query-one
         {:select [[[:count [:distinct :table_id]] :table_count]]
          :from   [(t2/table-name :model/UsageMetadataCandidate)]
          :where  [:= :run_id run-id]})]
    {:table-count table_count}))

(defn prune-old-candidate-snapshots!
  "Delete candidate payloads belonging to older runs, in bounded batches.

  Caps total work at `max-prune-batches-per-run` batches so a large backlog (e.g. the first run
  after enabling the feature, or after an algorithm-version bump) can't extend how long
  materialize! holds the cluster-wide snapshot-action lock; any remainder is picked up by the
  next run."
  [current-run-id]
  (loop [batches-remaining max-prune-batches-per-run]
    (when (pos? batches-remaining)
      (let [candidate-ids (t2/select-pks-set :model/UsageMetadataCandidate
                                             {:where    [:not= :run_id current-run-id]
                                              :order-by [[:id :asc]]
                                              :limit    prune-batch-size})]
        (when (seq candidate-ids)
          (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids])
          (recur (dec batches-remaining)))))))

(defn prune-old-snapshots!
  "Retire old candidate payloads and bound retained run diagnostics."
  [current-run-id]
  (prune-old-candidate-snapshots! current-run-id)
  (let [keep-ids (t2/select-pks-set :model/UsageMetadataCandidateRun
                                    {:order-by [[:id :desc]], :limit retained-run-count})]
    (when (seq keep-ids)
      (t2/delete! :model/UsageMetadataCandidateRun :id [:not-in keep-ids]))))

(defn materialize!
  "Populate `run` and atomically promote it while retiring old snapshot payloads."
  [{run-id :id :as run}]
  (let [card-ids        (candidate-mining/qualified-card-ids
                         (:minimum-recent-view-count source-config)
                         (:usage-window-days source-config))
        analysis-inputs (candidate-builders/candidate-analysis-inputs)]
    (doseq [batch (partition-all source-card-batch-size card-ids)]
      (persist-card-batch! run-id analysis-inputs batch))
    (prune-ineligible-candidates! run-id)
    (prune-non-closed-segment-candidates! run-id)
    (prune-non-closed-measure-candidates! run-id)
    (reconcile-candidates! run-id)
    (candidate-family/materialize! run-id)
    (let [summary (run-summary run-id)]
      (candidate-repository/with-snapshot-action-lock
        #(t2/with-transaction [_conn]
           (when-not (pos? (t2/update! :model/UsageMetadataCandidateRun
                                       {:id run-id, :status :running}
                                       {:status :succeeded, :finished_at (mi/now), :summary summary}))
             (throw (ex-info "Usage metadata candidate run is no longer active"
                             {:run-id run-id})))
           (prune-old-snapshots! run-id)))
      (assoc run :status :succeeded, :summary summary))))
