(ns metabase.usage-metadata.candidates
  "Durable snapshots of deterministic Measure and Segment cleanup observations."
  (:require
   [clojure.set :as set]
   [java-time.api :as t]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.insights :as insights]
   [metabase.usage-metadata.models.candidate]
   [metabase.usage-metadata.query-source :as query-source]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(def ^:const algorithm-version
  "Version of persisted candidate materialization behavior."
  6)

(def ^:const signature-version
  "Version of the canonical identity used by durable dismissals."
  2)
(def ^:private retained-run-count 20)
(def ^:private source-card-batch-size 100)
(def ^:private conditional-measure-types #{:count-where :distinct-where :sum-where})
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
  "Create a queued refresh run. Callers should use `queue-refresh!` so the active-run check is atomic."
  [trigger requested-by]
  (t2/insert-returning-instance! :model/UsageMetadataCandidateRun
                                 {:status            :queued
                                  :trigger           trigger
                                  :requested_by      requested-by
                                  :algorithm_version algorithm-version
                                  :source_config     {:kind :qualified-cards
                                                      :minimum-view-count 10
                                                      :candidate-cutoffs candidate-cutoffs}}))

(defn fail-run!
  "Mark a queued or running refresh as failed."
  [run error]
  (t2/update! :model/UsageMetadataCandidateRun (:id run)
              {:status :failed, :finished_at (mi/now), :error (ex-message error)})
  nil)

(defn- candidate-refresh-lock-timeout?
  [error]
  (contains? (set (:lock-names (ex-data error))) (str ::candidate-refresh)))

(defn- recover-interrupted-run!
  "Fail a `:running` row whose execution lock disappeared when its Metabase process stopped.

  Locally running ids avoid blocking on H2, whose in-process cluster locks do not support
  acquisition timeouts. On a multi-instance app DB, the execution lock remains authoritative."
  [{run-id :id, status :status :as run}]
  (if (and (= status :running)
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
    run))

(defn queue-refresh!
  "Atomically queue a refresh unless one is already queued or running.

  A `:running` row left behind by a stopped server is failed and replaced when
  the execution lock confirms that no refresh is still running."
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
                            :id [:in table-ids]))
        db-ids (into #{} (keep :db_id) tables)
        dbs     (when (seq db-ids)
                  (u/index-by :id
                              (t2/select [:model/Database :id :name :is_audit :is_sample :router_database_id]
                                         :id [:in db-ids])))]
    (into {}
          (keep (fn [{:keys [id db_id active visibility_type data_layer] :as table}]
                  (let [database (dbs db_id)]
                    (when (and active
                               (nil? visibility_type)
                               (not= :hidden data_layer)
                               database
                               (not (:is_audit database))
                               (not (:is_sample database))
                               (nil? (:router_database_id database)))
                      [id (assoc table :database database)]))))
          tables)))

(defn- observation-table-id
  [observation]
  (get-in observation [:source :id]))

(defn- observation-row
  [run-id observation]
  (let [{:keys [verified-source-count official-source-count popular-source-count
                distinct-source-count total-view-count]} (:evidence observation)
        type       (:candidate-type observation)
        complexity (case type
                     :segment (:atom-count observation)
                     :measure (or (get-in observation [:aggregation :condition-atom-count]) 0))
        signature  (:signature observation)]
    {:run_id                 run-id
     :candidate_type         type
     :table_id               (observation-table-id observation)
     :signature_version      signature-version
     :signature_hash         (sha256 signature)
     :signature              signature
     :definition             (:definition observation)
     :semantic_details       (case type
                               :measure (:aggregation observation)
                               :segment (select-keys observation [:predicate :fields :composite? :atom-count]))
     :suggested_name         (:suggested-name observation)
     :suggested_description  (:suggested-description observation)
     :modeling_status        :missing
     :verified_source_count  verified-source-count
     :official_source_count  official-source-count
     :popular_source_count   popular-source-count
     :distinct_source_count  distinct-source-count
     :total_view_count       total-view-count
     :complexity             complexity}))

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
  (into #{} (map insights/canonical-signature) (lib/atomic-filters (lib/normalize definition) 0)))

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
      (insights/canonical-signature [table-id (insights/canonical-signature aggregation)]))

    :segment
    (let [atoms (segment-atoms definition)]
      (when (seq atoms)
        (insights/canonical-signature [table-id (vec (sort atoms))])))))

(defn- existing-entities
  [type table-id]
  (let [model (case type :measure :model/Measure :segment :model/Segment)]
    (mapv (fn [{:keys [definition] :as entity}]
            (assoc entity :signature (existing-signature type table-id definition)))
          (t2/select [model :id :table_id :name :definition]
                     :table_id table-id
                     :archived false))))

(defn- reconcile-candidate!
  [{:keys [id candidate_type table_id] :as candidate} published?]
  (let [relation-fn (case candidate_type
                      :measure relation-for-measure
                      :segment relation-for-segment)
        matches     (when published?
                      (keep (fn [entity]
                              (when-let [relation (relation-fn candidate entity)]
                                {:relation relation, :entity entity}))
                            (existing-entities candidate_type table_id)))
        status      (cond
                      (some #(= :exact (:relation %)) matches) :modeled
                      (seq matches)                            :partially-modeled
                      :else                                    :missing)]
    (doseq [{:keys [relation entity]} matches]
      (t2/insert! :model/UsageMetadataCandidateMatch
                  (cond-> {:candidate_id id, :relation relation}
                    (= candidate_type :measure) (assoc :measure_id (:id entity))
                    (= candidate_type :segment) (assoc :segment_id (:id entity)))))
    (t2/update! :model/UsageMetadataCandidate id {:modeling_status status})
    status))

(defn- add-evidence
  [candidate observation]
  (let [{:keys [verified-source-count official-source-count popular-source-count
                distinct-source-count total-view-count]} (:evidence observation)]
    {:verified_source_count (+ (:verified_source_count candidate) verified-source-count)
     :official_source_count (+ (:official_source_count candidate) official-source-count)
     :popular_source_count  (+ (:popular_source_count candidate) popular-source-count)
     :distinct_source_count (+ (:distinct_source_count candidate) distinct-source-count)
     :total_view_count      (+ (:total_view_count candidate) total-view-count)}))

(defn- persist-observation!
  [run-id observation table]
  (let [row       (observation-row run-id observation)
        existing  (t2/select-one :model/UsageMetadataCandidate
                                 :run_id run-id
                                 :candidate_type (:candidate_type row)
                                 :table_id (:table_id row)
                                 :signature_hash (:signature_hash row))
        _         (when (and existing (not= (:signature existing) (:signature row)))
                    (throw (ex-info "Candidate signature hash collision"
                                    {:candidate-id (:id existing)})))
        candidate (or existing
                      (t2/insert-returning-instance! :model/UsageMetadataCandidate row))]
    (doseq [source (get-in observation [:evidence :source-items])]
      (t2/insert! :model/UsageMetadataCandidateSource (source-row (:id candidate) source)))
    (if existing
      (t2/update! :model/UsageMetadataCandidate (:id candidate)
                  (add-evidence candidate observation))
      (reconcile-candidate! (assoc candidate
                                   :definition (:definition observation)
                                   :signature (:signature observation))
                            (:is_published table)))))

(defn- persist-card-batch!
  [run-id card-ids]
  (let [{:keys [measures segments]}
        (insights/cleanup-candidates
         {:query-source (query-source/card-id-set card-ids)
          :include-ineligible? true})
        observations (concat measures segments)
        tables       (usable-table-index (into #{} (map observation-table-id) observations))]
    (doseq [observation observations
            :let [table (tables (observation-table-id observation))]
            :when table]
      (persist-observation! run-id observation table))))

(defn- semantically-eligible?
  [{:keys [candidate_type semantic_details complexity verified_source_count
           official_source_count distinct_source_count]}]
  (let [semantic-type (some-> (:type semantic_details) keyword)]
    (case candidate_type
      :measure
      (and (not (and (= :count semantic-type)
                     (nil? (:field semantic_details))))
           (or (not (contains? conditional-measure-types semantic-type))
               (pos? verified_source_count)
               (pos? official_source_count)
               (>= distinct_source_count 2)))

      :segment
      (or (= complexity 1)
          (pos? verified_source_count)
          (pos? official_source_count)
          (>= distinct_source_count 2))

      false)))

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
        (doseq [candidate rows
                :when (not (globally-eligible? candidate))]
          (t2/delete! :model/UsageMetadataCandidate :id (:id candidate)))
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

(defn- non-closed-segment-candidate-ids
  [candidates provenance-index]
  (->> candidates
       (map (fn [candidate]
              (assoc candidate
                     ::atoms (segment-atoms (:definition candidate))
                     ::provenance (get provenance-index (:id candidate)))))
       (group-by (juxt :table_id ::provenance))
       (keep (fn [[[_table-id provenance] candidates]]
               (when (seq provenance)
                 (for [{candidate-id :id, candidate-atoms ::atoms} candidates
                       :when (some (fn [{other-id :id, other-atoms ::atoms}]
                                     (and (not= candidate-id other-id)
                                          (< (count candidate-atoms) (count other-atoms))
                                          (set/subset? candidate-atoms other-atoms)))
                                   candidates)]
                   candidate-id))))
       (into #{} cat)))

(defn- prune-non-closed-segment-candidates!
  "Remove Segment subsets that carry no provenance beyond a stricter Segment on the same table."
  [run-id]
  (doseq [table-id (t2/select-fn-set :table_id :model/UsageMetadataCandidate
                                     :run_id run-id
                                     :candidate_type :segment)]
    (let [candidates       (t2/select [:model/UsageMetadataCandidate :id :table_id :definition]
                                      :run_id run-id
                                      :candidate_type :segment
                                      :table_id table-id)
          provenance-index (source-provenance-index (map :id candidates))
          candidate-ids    (non-closed-segment-candidate-ids candidates provenance-index)]
      (when (seq candidate-ids)
        (t2/delete! :model/UsageMetadataCandidate :id [:in candidate-ids])))))

(defn- run-summary
  [run-id]
  (let [measure-count (t2/count :model/UsageMetadataCandidate
                                :run_id run-id :candidate_type :measure)
        segment-count (t2/count :model/UsageMetadataCandidate
                                :run_id run-id :candidate_type :segment)
        table-count   (:total
                       (t2/query-one
                        {:select [[[:count [:distinct :table_id]] :total]]
                         :from   [(t2/table-name :model/UsageMetadataCandidate)]
                         :where  [:= :run_id run-id]}))]
    {:candidate-count (+ measure-count segment-count)
     :measure-count measure-count
     :segment-count segment-count
     :table-count table-count}))

(defn- prune-old-snapshots!
  [current-run-id]
  ;; Only the newest successful snapshot remains queryable. Keep bounded run rows
  ;; for diagnostics, but discard their potentially large candidate payloads.
  (t2/delete! :model/UsageMetadataCandidate :run_id [:not= current-run-id])
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
    (let [card-ids (insights/qualified-card-ids)]
      (doseq [batch (partition-all source-card-batch-size card-ids)]
        (persist-card-batch! run-id batch))
      (prune-ineligible-candidates! run-id)
      (prune-non-closed-segment-candidates! run-id)
      (let [summary (run-summary run-id)]
        (t2/update! :model/UsageMetadataCandidateRun run-id
                    {:status :succeeded, :finished_at (mi/now), :summary summary})
        (prune-old-snapshots! run-id)
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
                    entity-key    (:id entity)}]
    (when-not (t2/exists? :model/UsageMetadataCandidateMatch
                          :candidate_id (:id candidate)
                          :relation :exact
                          entity-key (:id entity))
      (t2/insert! :model/UsageMetadataCandidateMatch match-keys))
    (t2/update! :model/UsageMetadataCandidate (:id candidate) {:modeling_status :modeled})
    entity))

(defn dismiss!
  "Create or return the durable instance-wide dismissal for `candidate`."
  [candidate user-id reason]
  (let [identity (select-keys candidate [:candidate_type :table_id :signature_version
                                         :signature_hash :signature])]
    (or (t2/select-one :model/UsageMetadataCandidateDismissal
                       :candidate_type (:candidate_type candidate)
                       :table_id (:table_id candidate)
                       :signature_version (:signature_version candidate)
                       :signature_hash (:signature_hash candidate))
        (t2/insert-returning-instance! :model/UsageMetadataCandidateDismissal
                                       (assoc identity
                                              :dismissed_by user-id
                                              :reason reason
                                              :dismissed_at (mi/now))))))

(defn restore!
  "Remove the durable dismissal for `candidate`."
  [candidate]
  (t2/delete! :model/UsageMetadataCandidateDismissal
              :candidate_type (:candidate_type candidate)
              :table_id (:table_id candidate)
              :signature_version (:signature_version candidate)
              :signature_hash (:signature_hash candidate))
  nil)
