(ns metabase.usage-metadata.candidate-repository
  "Queries and persistence operations for mined candidates and their Library reconciliation state."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.models.candidate]))

(set! *warn-on-reflection* true)

(def ^:private existing-entity-query-batch-size 200)
(def ^:private dismissal-identity-keys
  [:candidate_type :table_id :signature_version :signature_hash])

(defn with-snapshot-action-lock
  "Run `f` while snapshot promotion and candidate actions are mutually exclusive across the cluster.

  Uses a detached lock so `f`'s appdb writes commit on their own, outside the lock's transaction —
  Measure/Segment creation publishes domain events after commit and needs those events to see the
  same semantics as their normal REST creation endpoints. `f` must be idempotent/self-healing: on a
  throw, work `f` already committed is not rolled back."
  [f]
  (cluster-lock/with-detached-cluster-lock {:lock ::snapshot-promotion-or-action, :timeout-seconds 30}
    (f)))

(defn candidate
  "Fetch a persisted candidate by id."
  [id]
  (usage-metadata.db/candidate id))

(defn candidate-table
  "Fetch the physical table targeted by `candidate`."
  [candidate]
  (usage-metadata.db/table (:table_id candidate)))

(defn dismissal-identity
  "Return the durable identity shared by a candidate and its dismissal."
  [candidate]
  (select-keys candidate dismissal-identity-keys))

(defn dismissal-key
  "Return a value suitable for indexing candidates and dismissals by durable identity."
  [candidate]
  (mapv candidate dismissal-identity-keys))

(defn- dismissal-index
  [candidates]
  (let [table-ids (into #{} (map :table_id) candidates)]
    (if (seq table-ids)
      (into {}
            (map (juxt dismissal-key identity))
            (usage-metadata.db/table-candidate-dismissals table-ids))
      {})))

(defn- dismissed?
  [dismissals candidate]
  (contains? dismissals (dismissal-key candidate)))

(defn- table-index
  [table-ids]
  (if (seq table-ids)
    (let [tables (map #(select-keys % [:id :db_id :schema :display_name :active :is_published :collection_id])
                      (usage-metadata.db/candidate-dependency-tables (set table-ids)))
          db-ids (into #{} (keep :db_id) tables)
          dbs    (if (seq db-ids)
                   (into {} (map (juxt :id identity)) (usage-metadata.db/candidate-databases db-ids))
                   {})]
      (into {}
            (map (fn [{:keys [id db_id] :as table}]
                   [id (assoc table :database (select-keys (dbs db_id) [:id :name]))]))
            tables))
    {}))

(defn candidate-page
  "Return one stable page of candidates from `run-id`, including durable dismissal state."
  [run-id filters {:keys [limit offset]}]
  (let [total      (usage-metadata.db/candidate-list-count run-id filters)
        ids        (usage-metadata.db/candidate-list-ids run-id filters limit offset)
        candidates (if (seq ids)
                     (usage-metadata.db/candidates-by-id
                      [:candidate_type :table_id :signature_version :signature_hash
                       :display_name :semantic_details :modeling_status
                       :verified_source_count :official_source_count :popular_source_count
                       :distinct_source_count :recent_view_count :last_used_at]
                      ids)
                     {})
        rows        (keep candidates ids)
        dismissals  (dismissal-index rows)]
    {:rows  (mapv #(assoc % :dismissed? (dismissed? dismissals %)) rows)
     :total total}))

(defn table-page
  "Return one stable page of table summaries for candidates in `run-id`."
  [run-id filters {:keys [limit offset]}]
  (let [total  (usage-metadata.db/candidate-table-list-count run-id filters)
        counts (usage-metadata.db/candidate-table-list-counts run-id filters limit offset)
        tables (table-index (into #{} (map :table_id) counts))]
    {:rows  (mapv (fn [{:keys [table_id candidate_count]}]
                    {:table (tables table_id), :candidate-count candidate_count})
                  counts)
     :total total}))

(defn candidate-detail
  "Load the table, provenance, matches, and dismissal state needed to represent `candidate`."
  [candidate]
  (let [candidate-table ((table-index #{(:table_id candidate)}) (:table_id candidate))
        dismissals      (dismissal-index [candidate])
        sources         (mapv #(dissoc % :candidate_id)
                              (usage-metadata.db/candidate-sources [(:id candidate)]))
        collection-ids  (into #{} (keep :collection_id) sources)
        collections     (when (seq collection-ids)
                          (into {} (map (juxt :id identity)) (usage-metadata.db/collection-names collection-ids)))
        matches         (usage-metadata.db/candidate-matches (:id candidate))]
    {:candidate candidate
     :table candidate-table
     :dismissed? (dismissed? dismissals candidate)
     :sources (mapv #(assoc % :collection (get collections (:collection_id %))) sources)
     :matches matches}))

(defn existing-entity-index
  "Load active Library entities once for each requested `[candidate-type table-id]` pair.

  Table ids are queried in bounded batches, and every definition is canonicalized exactly once before it is added to
  the returned index."
  [candidate-keys]
  (reduce
   (fn [index type]
     (let [table-ids (into #{} (comp (filter #(= type (first %))) (keep second)) candidate-keys)
           model     (case type :measure :model/Measure :segment :model/Segment)]
       (reduce
        (fn [index {:keys [table_id] :as entity}]
          (update index [type table_id] (fnil conj [])
                  (definitions/reconciliation-entity type table_id entity)))
        index
        (mapcat #(usage-metadata.db/unarchived-library-entities model (vec %))
                (partition-all existing-entity-query-batch-size table-ids)))))
   {}
   [:measure :segment]))

(defn existing-entities
  "Return active Measure or Segment entities on a table with canonical reconciliation data."
  [type table-id]
  (get (existing-entity-index #{[type table-id]}) [type table-id] []))

(defn exact-existing-entity
  "Return the current active Measure or Segment exactly matching `candidate`, if one exists."
  [candidate]
  (some (fn [entity]
          (when (= (:signature candidate) (:signature entity))
            entity))
        (existing-entities (:candidate_type candidate) (:table_id candidate))))

(defn candidate-match-row
  "Build a persisted match row for a candidate and Library entity."
  [candidate entity relation]
  {:candidate_id       (:id candidate)
   :relation           relation
   :entity_id          (:id entity)
   :entity_name        (:name entity)
   :entity_description (:description entity)})

(defn mark-modeled!
  "Record an exact Library entity match and update the current candidate immediately."
  [candidate entity]
  (let [match-keys {:candidate_id (:id candidate)
                    :relation     :exact
                    :entity_id    (:id entity)}
        match-row  (candidate-match-row candidate entity :exact)]
    (usage-metadata.db/select-or-insert-candidate-match! match-keys match-row)
    (usage-metadata.db/update-candidates! [(:id candidate)] {:modeling_status :modeled})
    entity))

(defn dismiss!
  "Create or return the durable instance-wide dismissal for `candidate`."
  [candidate user-id]
  (let [identity (dismissal-identity candidate)]
    (usage-metadata.db/select-or-insert-candidate-dismissal!
     identity
     (assoc identity
            :dismissed_by user-id
            :dismissed_at (mi/now)))))

(defn restore!
  "Remove the durable dismissal for `candidate`."
  [candidate]
  (usage-metadata.db/delete-candidate-dismissal! (dismissal-identity candidate))
  nil)
