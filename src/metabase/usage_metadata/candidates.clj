(ns metabase.usage-metadata.candidates
  "Durable snapshots of deterministic Library cleanup observations."
  (:require
   [clojure.math.combinatorics :as math.combo]
   [clojure.set :as set]
   [java-time.api :as t]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as app-db]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-builders :as candidate-builders]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]
   [metabase.usage-metadata.models.candidate]
   [metabase.usage-metadata.query-source :as query-source]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:const algorithm-version
  "Version of persisted candidate materialization behavior."
  1)

(def ^:const signature-version
  "Version of the canonical identity used by durable dismissals."
  1)
(def ^:private retained-run-count 20)
(def ^:private source-card-batch-size 100)
(def ^:private queued-run-startup-grace (t/minutes 5))
(def ^:private source-usage-window-days 90)
(def ^:private source-minimum-recent-view-count 10)
(defonce ^:private locally-running-run-ids (atom #{}))
(def ^:private candidate-cutoffs
  "Fixed candidate-level evidence requirements applied after all source batches are aggregated."
  {:verified {:minimum-total-view-count 10}
   :official {:minimum-distinct-source-count 2
              :minimum-total-view-count      10}
   :general  {:minimum-distinct-source-count 3
              :minimum-total-view-count      25}})

(defn- sha256
  ^String [^String value]
  (let [digest (.digest (MessageDigest/getInstance "SHA-256")
                        (.getBytes value StandardCharsets/UTF_8))]
    (apply str (map #(format "%02x" (bit-and % 0xff)) digest))))

(defn latest-successful-run
  "Return the newest completely materialized candidate snapshot."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status :succeeded
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(defn active-run
  "Return the newest queued or running candidate refresh."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status [:in [:queued :running]]
                 {:order-by [[:id :desc]]}))

(defn latest-failed-run
  "Return the newest failed candidate refresh."
  []
  (t2/select-one :model/UsageMetadataCandidateRun
                 :status :failed
                 {:order-by [[:finished_at :desc] [:id :desc]]}))

(defn refresh-status
  "Return the successful, active, and failed refresh state used by the API."
  []
  (let [snapshot (latest-successful-run)]
    {:snapshot snapshot
     :active   (active-run)
     :failure  (latest-failed-run)
     :fresh    (boolean
                (some-> (:finished_at snapshot)
                        (t/after? (t/minus (t/offset-date-time) (t/hours 25)))))}))

(defn- create-run!
  "Create a queued refresh run. Callers should use [[queue-refresh!]] so the active-run check is atomic."
  [trigger requested-by]
  (t2/insert-returning-instance! :model/UsageMetadataCandidateRun
                                 {:status            :queued
                                  :trigger           trigger
                                  :requested_by      requested-by
                                  :algorithm_version algorithm-version
                                  :source_config     {:kind :qualified-cards
                                                      :usage-window-days source-usage-window-days
                                                      :minimum-recent-view-count source-minimum-recent-view-count
                                                      :candidate-cutoffs candidate-cutoffs}}))

(defn fail-run!
  "Mark a queued or running refresh as failed."
  [run error]
  (t2/update! :model/UsageMetadataCandidateRun (:id run)
              {:status :failed, :finished_at (mi/now), :error (ex-message error)})
  nil)

(defn- candidate-refresh-lock-timeout?
  [error]
  (let [lock-name (str (namespace ::candidate-refresh) "/" (name ::candidate-refresh))]
    (boolean (some #{lock-name} (:lock-names (ex-data error))))))

(defn- queued-run-stale?
  [{:keys [status created_at]}]
  (and (= status :queued)
       (some-> created_at
               (t/before? (t/minus (t/offset-date-time) queued-run-startup-grace)))))

(defn- recover-interrupted-run!
  "Fail an active row left behind when its Metabase process stopped.

  A run that remains queued beyond the startup grace never reached its worker. For a running
  row, locally running ids avoid blocking on H2, whose in-process cluster locks do not support
  acquisition timeouts; on a multi-instance app DB, the execution lock remains authoritative."
  [{run-id :id, status :status :as run}]
  (cond
    (queued-run-stale? run)
    (do
      (fail-run! run (ex-info "Usage metadata candidate refresh was interrupted before processing started"
                              {:run-id run-id}))
      nil)

    (and (= status :running)
         (not (contains? @locally-running-run-ids run-id)))
    (try
      (cluster-lock/with-cluster-lock {:lock ::candidate-refresh
                                       :timeout-seconds 1
                                       :retry-config {:max-retries 0}}
        (when (= :running (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id run-id))
          (fail-run! run (ex-info "Usage metadata candidate refresh was interrupted by a server shutdown or restart"
                                  {:run-id run-id})))
        nil)
      (catch Exception e
        (if (candidate-refresh-lock-timeout? e)
          run
          (throw e))))

    :else
    run))

(defn queue-refresh!
  "Atomically queue a refresh unless one is already queued or running.

  An orphaned `:queued` row is failed after its startup grace. A `:running` row
  is failed and replaced when the execution lock confirms no refresh is active."
  [trigger requested-by]
  (cluster-lock/with-cluster-lock {:lock ::candidate-refresh-enqueue, :timeout-seconds 1}
    (when-not (some-> (active-run) recover-interrupted-run!)
      (create-run! trigger requested-by))))

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
                                      [:not= :data_layer [:inline "hidden"]]]]}))
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
     :suggested-name        (tru "Publish {0}" (:display-name table))
     :suggested-description (tru "Saved content depends on this unpublished table.")
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
     :total_view_count       total-view-count
     :complexity             complexity
     :family_key             signature-hash
     :family_order           0
     :family_position        0
     :family_depth           0}))

(defn- source-row
  [candidate-id source]
  {:candidate_id  candidate-id
   :card_id       (:id source)
   :card_name     (:name source)
   :card_type     (:type source)
   :verified      (:verified? source)
   :official      (:official-collection? source)
   :popular       (:popular? source)
   :view_count    (:view-count source)
   :joined        (:joined? source)
   :stage_numbers (:stage-numbers source)
   :model_lineage (:model-lineage source)})

(defn- aggregation-clause
  [definition]
  (first (lib/aggregations (lib/normalize definition) 0)))

(defn- field-id
  [clause]
  (when (lib/clause-of-type? clause :field)
    (nth clause 2 nil)))

(defn- measure-base
  [definition]
  (when-let [[tag _opts & args] (aggregation-clause definition)]
    (case tag
      :count-where    [:count nil]
      :distinct-where [:distinct (field-id (first args))]
      :sum-where      [:sum (field-id (first args))]
      [tag (field-id (first args))])))

(defn- segment-atoms
  [definition]
  (into #{} (map candidate-mining/canonical-signature) (lib/atomic-filters (lib/normalize definition) 0)))

(defn- measure-condition-atoms
  [definition]
  (when-let [[tag _opts & args] (aggregation-clause definition)]
    (when-let [condition (case tag
                           :count-where    (first args)
                           :distinct-where (second args)
                           :sum-where      (second args)
                           nil)]
      (letfn [(flatten-and [[clause-tag _opts & clause-args :as clause]]
                (if (= clause-tag :and)
                  (mapcat flatten-and clause-args)
                  [clause]))]
        (into #{} (map candidate-mining/canonical-signature) (flatten-and condition))))))

(defn- relation-for-segment
  [candidate existing]
  (let [candidate-atoms (segment-atoms (:definition candidate))
        existing-atoms  (segment-atoms (:definition existing))
        overlap         (set/intersection candidate-atoms existing-atoms)]
    (cond
      (= (:signature candidate) (:signature existing)) :exact
      (empty? overlap)                                nil
      (set/subset? existing-atoms candidate-atoms)    :subset
      (set/subset? candidate-atoms existing-atoms)    :superset
      :else                                           :overlap)))

(defn- relation-for-measure
  [candidate existing]
  (cond
    (= (:signature candidate) (:signature existing)) :exact
    (= (measure-base (:definition candidate))
       (measure-base (:definition existing)))        :same-base
    :else                                             nil))

(defn- existing-signature
  [type table-id definition]
  (case type
    :measure
    (when-let [aggregation (aggregation-clause definition)]
      (candidate-mining/canonical-signature [table-id (candidate-mining/canonical-signature aggregation)]))

    :segment
    (let [atoms (segment-atoms definition)]
      (when (seq atoms)
        (candidate-mining/canonical-signature [table-id (vec (sort atoms))])))))

(defn- existing-entities
  [type table-id]
  (let [model (case type :measure :model/Measure :segment :model/Segment)]
    (mapv (fn [{:keys [definition] :as entity}]
            (assoc entity :signature (existing-signature type table-id definition)))
          (t2/select [model :id :table_id :name :description :archived :definition]
                     :table_id table-id
                     :archived false))))

(defn- candidate-match-row
  [candidate entity relation]
  (cond-> {:candidate_id       (:id candidate)
           :relation           relation
           :entity_name        (:name entity)
           :entity_description (:description entity)
           :entity_archived    (boolean (:archived entity))}
    (= (:candidate_type candidate) :measure) (assoc :measure_id (:id entity))
    (= (:candidate_type candidate) :segment) (assoc :segment_id (:id entity))))

(defn- reconcile-candidate!
  [{:keys [id candidate_type table_id] :as candidate} published?]
  (if-let [relation-fn (case candidate_type
                         :measure relation-for-measure
                         :segment relation-for-segment
                         nil)]
    ;; Measures and Segments only count as Library entities while their owning table is published.
    ;; Definitions left behind on an unpublished table are deliberately ignored: the report should
    ;; recommend restoring the table to the Library before treating those entities as modeled.
    (let [matches (when published?
                    (keep (fn [entity]
                            (when-let [relation (relation-fn candidate entity)]
                              {:relation relation, :entity entity}))
                          (existing-entities candidate_type table_id)))
          status  (cond
                    (some #(= :exact (:relation %)) matches) :modeled
                    (seq matches)                            :partially-modeled
                    :else                                    :missing)]
      (doseq [{:keys [relation entity]} matches]
        (t2/insert! :model/UsageMetadataCandidateMatch
                    (candidate-match-row candidate entity relation)))
      (t2/update! :model/UsageMetadataCandidate id {:modeling_status status})
      status)
    :missing))

(defn- merged-source-dependencies
  [candidate observation]
  (->> (concat (get-in candidate [:semantic_details :source-dependencies])
               (get-in observation [:semantic-details :source-dependencies]))
       (group-by :card-id)
       (map (fn [[card-id dependencies]]
              {:card-id card-id
               :dependency-paths (->> dependencies
                                      (mapcat :dependency-paths)
                                      distinct
                                      vec)}))
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
             :total_view_count      (+ (:total_view_count candidate) total-view-count)}
      (= :table (:candidate_type candidate))
      (assoc :semantic_details
             (assoc (:semantic_details candidate)
                    :source-dependencies (merged-source-dependencies candidate observation))))))

(defn- persist-observation!
  [run-id observation table]
  (let [row       (observation-row run-id observation)
        existing  (t2/select-one :model/UsageMetadataCandidate
                                 :run_id run-id
                                 :candidate_type (:candidate_type row)
                                 :table_id (:table_id row)
                                 :signature_version (:signature_version row)
                                 :signature_hash (:signature_hash row))
        _         (when (and existing (not= (:signature existing) (:signature row)))
                    (throw (ex-info "Candidate signature hash collision"
                                    {:candidate-id (:id existing)})))
        candidate (or existing
                      (t2/insert-returning-instance! :model/UsageMetadataCandidate row))]
    (when-let [source-rows (not-empty (mapv #(source-row (:id candidate) %)
                                            (get-in observation [:evidence :source-items])))]
      (t2/insert! :model/UsageMetadataCandidateSource source-rows))
    (if existing
      (t2/update! :model/UsageMetadataCandidate (:id candidate)
                  (merged-evidence candidate observation))
      (reconcile-candidate! (assoc candidate
                                   :definition (:definition observation)
                                   :signature (:signature observation))
                            (:is_published table)))))

(defn- persist-card-batch!
  [run-id card-ids]
  (candidate-mining/with-candidate-batch-cache
    #(lib-be/with-metadata-provider-cache
       (let [query-source (query-source/card-id-set card-ids)
             opts         {:query-source query-source
                           :min-view-count source-minimum-recent-view-count
                           :view-count-window-days source-usage-window-days}
             {:keys [measures segments]}
             (candidate-builders/cleanup-candidates (assoc opts :include-ineligible? true))
             table-report (candidate-builders/candidate-table-observations opts)
             metrics      (candidate-builders/candidate-metric-observations opts)
             observations (concat measures
                                  segments
                                  (map table-candidate-observation (:candidates table-report))
                                  (keep metric-candidate-observation metrics))
             tables       (usable-table-index (into #{} (map observation-table-id) observations))]
         (doseq [observation observations
                 :let [table (tables (observation-table-id observation))]
                 :when table]
           (persist-observation! run-id observation table))))))

(defn- candidate-row->observation
  [{:keys [candidate_type semantic_details complexity verified_source_count official_source_count
           popular_source_count distinct_source_count total_view_count signature]}]
  {:candidate-type candidate_type
   :aggregation    (when (= candidate_type :measure)
                     (update semantic_details :type #(some-> % keyword)))
   :atom-count     (when (= candidate_type :segment) complexity)
   :evidence       {:verified-source-count verified_source_count
                    :official-source-count official_source_count
                    :popular-source-count  popular_source_count
                    :distinct-source-count distinct_source_count
                    :total-view-count      total_view_count}
   :signature      signature})

(defn- semantically-eligible?
  [candidate]
  (candidate-mining/semantically-eligible-candidate?
   (candidate-row->observation candidate)))

(defn- evidence-eligible?
  [{:keys [verified_source_count official_source_count distinct_source_count total_view_count]}]
  (let [{verified-min-views :minimum-total-view-count}                     (:verified candidate-cutoffs)
        {official-min-sources :minimum-distinct-source-count
         official-min-views   :minimum-total-view-count}                   (:official candidate-cutoffs)
        {general-min-sources :minimum-distinct-source-count
         general-min-views   :minimum-total-view-count}                    (:general candidate-cutoffs)]
    (or (and (pos? verified_source_count)
             (>= total_view_count verified-min-views))
        (and (pos? official_source_count)
             (>= distinct_source_count official-min-sources)
             (>= total_view_count official-min-views))
        (and (>= distinct_source_count general-min-sources)
             (>= total_view_count general-min-views)))))

(defn- globally-eligible?
  [candidate]
  (and (semantically-eligible? candidate)
       (evidence-eligible? candidate)))

(defn- prune-ineligible-candidates!
  [run-id]
  (loop [last-id 0]
    (let [rows (t2/select [:model/UsageMetadataCandidate :id :candidate_type :semantic_details
                           :complexity :verified_source_count :official_source_count
                           :distinct_source_count :total_view_count]
                          :run_id run-id
                          :id [:> last-id]
                          {:order-by [[:id :asc]], :limit 200})]
      (when (seq rows)
        (let [candidate-ids (into []
                                  (comp (remove globally-eligible?)
                                        (map :id))
                                  rows)]
          (when (seq candidate-ids)
            (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids])))
        (recur (long (:id (peek rows))))))))

(defn- source-provenance-index
  [candidate-ids]
  (let [sources (->> candidate-ids
                     (partition-all 200)
                     (mapcat (fn [ids]
                               (t2/select [:model/UsageMetadataCandidateSource
                                           :candidate_id :card_id :card_name :card_type
                                           :verified :official :popular :view_count :joined
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

(defn- non-closed-segment-candidate-ids
  [candidates provenance-index]
  (non-closed-candidate-ids
   candidates
   provenance-index
   (fn [candidate]
     {:atoms  (segment-atoms (:definition candidate))
      :domain nil})))

(defn- non-closed-measure-candidate-ids
  [candidates provenance-index]
  (non-closed-candidate-ids
   candidates
   provenance-index
   (fn [candidate]
     (when-let [atoms (not-empty (measure-condition-atoms (:definition candidate)))]
       {:atoms  atoms
        :domain (measure-base (:definition candidate))}))))

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
  "Remove Segment subsets that carry no provenance beyond a stricter Segment on the same table."
  [run-id]
  (prune-non-closed-candidates! run-id :segment non-closed-segment-candidate-ids))

(defn- prune-non-closed-measure-candidates!
  "Remove conditional Measure subsets that carry no provenance beyond a stricter condition on the
  same base aggregation and table."
  [run-id]
  (prune-non-closed-candidates! run-id :measure non-closed-measure-candidate-ids))

(defn- candidate-atom-details
  [{:keys [candidate_type semantic_details]}]
  (case candidate_type
    :segment (:atoms semantic_details)
    :measure (:condition-atoms semantic_details)
    nil))

(defn- candidate-priority-key
  [candidate]
  (candidate-mining/candidate-sort-key
   (candidate-row->observation candidate)))

(defn- candidate-family-domain
  [{:keys [table_id candidate_type modeling_status definition]}]
  [table_id
   candidate_type
   (if (= modeling_status :modeled) :modeled :suggested)
   (when (= candidate_type :measure)
     (measure-base definition))])

(defn- candidate-with-atom-signatures
  [candidate]
  (if (contains? candidate ::atom-signatures)
    candidate
    (assoc candidate ::atom-signatures
           (into #{} (map :signature) (candidate-atom-details candidate)))))

(defn- candidate-primary-parent
  [candidate candidates-by-atom-set]
  (let [candidate-atoms (::atom-signatures candidate)]
    (when (seq candidate-atoms)
      ;; Candidate mining limits definitions to five atoms. Exact subset lookups are therefore bounded,
      ;; unlike scanning every candidate in the table/type/status domain for each candidate.
      (some (fn [parent-atom-count]
              (->> (math.combo/combinations (sort candidate-atoms) parent-atom-count)
                   (mapcat #(get candidates-by-atom-set (set %)))
                   (sort-by candidate-priority-key)
                   first))
            (range (dec (count candidate-atoms)) -1 -1)))))

(defn- candidate-family-parent-index
  [candidates]
  (let [candidates            (mapv candidate-with-atom-signatures candidates)
        candidates-by-domain  (group-by candidate-family-domain candidates)
        candidates-by-domain-and-atoms
        (update-vals candidates-by-domain #(group-by ::atom-signatures %))]
    (into {}
          (keep (fn [candidate]
                  (when-let [parent (candidate-primary-parent
                                     candidate
                                     (get candidates-by-domain-and-atoms
                                          (candidate-family-domain candidate)))]
                    [(:id candidate) (:id parent)])))
          candidates)))

(defn- candidate-root-id
  [candidate-id parent-index]
  (loop [id candidate-id]
    (if-let [parent-id (parent-index id)]
      (recur parent-id)
      id)))

(defn- ordered-candidate-atoms
  [candidate parent-order]
  (let [atom-signatures (::atom-signatures candidate)
        inherited       (filterv atom-signatures parent-order)
        remaining       (->> atom-signatures (remove (set inherited)) sort vec)]
    (into inherited remaining)))

(defn- family-display-name
  [candidate atom-order]
  (let [details-by-signature (u/index-by :signature (candidate-atom-details candidate))
        atom-names           (mapv (comp :display-name details-by-signature) atom-order)
        condition-name       (when (every? some? atom-names)
                               (i18n/join-strings-with-conjunction (tru "and") atom-names))]
    (u.str/elide
     (or
      (when condition-name
        (case (:candidate_type candidate)
          :segment condition-name
          :measure (when-let [base-name (get-in candidate [:semantic_details :base-name])]
                     (tru "{0} where {1}" base-name condition-name))))
      (:suggested_name candidate))
     254)))

(defn- ordered-atom-details
  [candidate atom-order]
  (let [details-by-signature (u/index-by :signature (candidate-atom-details candidate))]
    (mapv details-by-signature atom-order)))

(defn- ordered-family
  [root children-index candidates-by-id]
  (letfn [(walk [candidate depth parent-order]
            (let [atom-order (ordered-candidate-atoms candidate parent-order)
                  children   (sort-by
                              (fn [child]
                                [(candidate-priority-key child)
                                 (->> (::atom-signatures child)
                                      (remove (::atom-signatures candidate))
                                      sort
                                      vec)])
                              (map candidates-by-id (children-index (:id candidate))))]
              (into [{:candidate candidate, :depth depth, :atom-order atom-order}]
                    (mapcat #(walk % (inc depth) atom-order))
                    children)))]
    (walk root 0 [])))

(defn- candidate-families
  [candidates]
  (let [candidates          (mapv candidate-with-atom-signatures candidates)
        candidates-by-id    (u/index-by :id candidates)
        parent-index        (candidate-family-parent-index candidates)
        children-index      (update-vals (group-by val parent-index)
                                         #(mapv key %))
        families-by-root-id (group-by #(candidate-root-id (:id %) parent-index) candidates)]
    (->> families-by-root-id
         (map (fn [[root-id members]]
                {:root    (candidates-by-id root-id)
                 :members members}))
         (sort-by (fn [{:keys [root members]}]
                    [(candidate-priority-key (first (sort-by candidate-priority-key members)))
                     (:signature root)
                     (:id root)]))
         (map-indexed
          (fn [family-order {:keys [root]}]
            (map-indexed
             (fn [family-position {:keys [candidate depth atom-order]}]
               {:candidate-id    (:id candidate)
                :display-name    (family-display-name candidate atom-order)
                :semantic-details (assoc (:semantic_details candidate)
                                         :display-atoms
                                         (ordered-atom-details candidate atom-order))
                :family-key      (:signature_hash root)
                :family-order    family-order
                :family-position family-position
                :family-depth    depth})
             (ordered-family root children-index candidates-by-id))))
         (into [] cat))))

(defn- materialize-candidate-families!
  [run-id]
  (let [candidates (t2/select [:model/UsageMetadataCandidate
                               :id :table_id :candidate_type :modeling_status
                               :signature_hash :signature :definition :semantic_details
                               :suggested_name :verified_source_count :official_source_count
                               :distinct_source_count :complexity :total_view_count]
                              :run_id run-id)]
    (doseq [{:keys [candidate-id] :as family} (candidate-families candidates)]
      (t2/update! :model/UsageMetadataCandidate candidate-id
                  (-> family
                      (dissoc :candidate-id)
                      (set/rename-keys {:display-name    :display_name
                                        :semantic-details :semantic_details
                                        :family-key      :family_key
                                        :family-order    :family_order
                                        :family-position :family_position
                                        :family-depth    :family_depth}))))))

(defn- run-summary
  [run-id]
  (let [measure-count (t2/count :model/UsageMetadataCandidate
                                :run_id run-id :candidate_type :measure)
        segment-count (t2/count :model/UsageMetadataCandidate
                                :run_id run-id :candidate_type :segment)
        metric-count  (t2/count :model/UsageMetadataCandidate
                                :run_id run-id :candidate_type :metric)
        publish-table-count (t2/count :model/UsageMetadataCandidate
                                      :run_id run-id :candidate_type :table)
        table-count   (:total
                       (t2/query-one
                        {:select [[[:count [:distinct :table_id]] :total]]
                         :from   [(t2/table-name :model/UsageMetadataCandidate)]
                         :where  [:= :run_id run-id]}))]
    {:candidate-count (+ measure-count segment-count metric-count publish-table-count)
     :measure-count measure-count
     :segment-count segment-count
     :metric-count metric-count
     :publish-table-count publish-table-count
     :table-count table-count}))

(defn- prune-old-candidate-snapshots!
  [current-run-id]
  (loop []
    (let [candidate-ids (t2/select-pks-set :model/UsageMetadataCandidate
                                           {:where   [:not= :run_id current-run-id]
                                            :order-by [[:id :asc]]
                                            :limit   200})]
      (when (seq candidate-ids)
        (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids])
        (recur)))))

(defn- prune-old-snapshots!
  [current-run-id]
  ;; Only the newest successful snapshot remains queryable. Keep bounded run rows
  ;; for diagnostics, but discard their potentially large candidate payloads.
  (prune-old-candidate-snapshots! current-run-id)
  (let [keep-ids (t2/select-pks-set :model/UsageMetadataCandidateRun
                                    {:order-by [[:id :desc]]
                                     :limit retained-run-count})]
    (when (seq keep-ids)
      (t2/delete! :model/UsageMetadataCandidateRun :id [:not-in keep-ids]))))

(defn- run-refresh-with-lock!
  "Populate `run` and atomically make it the latest successful snapshot.

  Rows belonging to a running or failed run are never read by the report API."
  [{run-id :id :as run}]
  (t2/update! :model/UsageMetadataCandidateRun run-id
              {:status :running, :started_at (mi/now), :error nil})
  (try
    (let [card-ids (candidate-mining/qualified-card-ids source-minimum-recent-view-count
                                                        source-usage-window-days)]
      (candidate-mining/with-candidate-analysis-cache
        #(doseq [batch (partition-all source-card-batch-size card-ids)]
           (persist-card-batch! run-id batch)))
      (prune-ineligible-candidates! run-id)
      (prune-non-closed-segment-candidates! run-id)
      (prune-non-closed-measure-candidates! run-id)
      (materialize-candidate-families! run-id)
      (let [summary (run-summary run-id)]
        ;; Promotion and retirement must commit together. If pruning fails, the
        ;; previous successful snapshot and all of its payload remain intact,
        ;; while the outer catch marks this run failed after the rollback.
        (t2/with-transaction [_conn]
          (t2/update! :model/UsageMetadataCandidateRun run-id
                      {:status :succeeded, :finished_at (mi/now), :summary summary})
          (prune-old-snapshots! run-id))
        (assoc run :status :succeeded, :summary summary)))
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (fail-run! run e)
      (throw e))
    (catch Exception e
      (log/error e "Usage metadata candidate refresh failed")
      (fail-run! run e)
      (throw e))))

(defn run-refresh!
  "Run a candidate refresh under the instance-wide candidate materialization lock."
  [{run-id :id :as run}]
  (swap! locally-running-run-ids conj run-id)
  (try
    (cluster-lock/with-cluster-lock {:lock ::candidate-refresh, :timeout-seconds 1}
      (run-refresh-with-lock! run))
    (catch Exception e
      ;; `run-refresh-with-lock!` records failures from inside the locked body.
      ;; This covers failures acquiring the lock itself, which happen before that
      ;; function can move the run out of :queued.
      (when (= :queued (t2/select-one-fn :status :model/UsageMetadataCandidateRun :id run-id))
        (fail-run! run e))
      (throw e))
    (finally
      (swap! locally-running-run-ids disj run-id))))

(defn candidate-current?
  "Whether `candidate` belongs to the latest successful snapshot."
  [candidate]
  (= (:run_id candidate) (:id (latest-successful-run))))

(defn candidate
  "Fetch a persisted candidate by id."
  [id]
  (t2/select-one :model/UsageMetadataCandidate :id id))

(defn exact-existing-entity
  "Return the current active Measure or Segment exactly matching `candidate`, if one exists."
  [candidate]
  (some (fn [entity]
          (when (= (:signature candidate)
                   (existing-signature (:candidate_type candidate)
                                       (:table_id candidate)
                                       (:definition entity)))
            entity))
        (existing-entities (:candidate_type candidate) (:table_id candidate))))

(defn mark-modeled!
  "Record an exact Library entity match and update the current candidate immediately."
  [candidate entity]
  (let [entity-key (case (:candidate_type candidate)
                     :measure :measure_id
                     :segment :segment_id)
        match-keys {:candidate_id (:id candidate)
                    :relation     :exact
                    entity-key    (:id entity)}
        match-row  (candidate-match-row candidate entity :exact)]
    (app-db/select-or-insert! :model/UsageMetadataCandidateMatch
                              match-keys
                              (constantly match-row))
    (t2/update! :model/UsageMetadataCandidate (:id candidate) {:modeling_status :modeled})
    entity))

(defn dismiss!
  "Create or return the durable instance-wide dismissal for `candidate`."
  [candidate user-id reason]
  (let [identity (select-keys candidate [:candidate_type :table_id :signature_version
                                         :signature_hash :signature])]
    (app-db/select-or-insert! :model/UsageMetadataCandidateDismissal
                              (select-keys identity [:candidate_type :table_id :signature_version :signature_hash])
                              #(assoc identity
                                      :dismissed_by user-id
                                      :reason reason
                                      :dismissed_at (mi/now)))))

(defn restore!
  "Remove the durable dismissal for `candidate`."
  [candidate]
  (t2/delete! :model/UsageMetadataCandidateDismissal
              :candidate_type (:candidate_type candidate)
              :table_id (:table_id candidate)
              :signature_version (:signature_version candidate)
              :signature_hash (:signature_hash candidate))
  nil)
