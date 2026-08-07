(ns metabase.usage-metadata.candidate-repository
  "Persistence operations for mined candidates and their Library reconciliation state."
  (:require
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.models.candidate]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private existing-entity-query-batch-size 200)
(def ^:private dismissal-identity-keys
  [:candidate_type :table_id :signature_version :signature_hash])

(defn with-snapshot-action-lock
  "Run `f` while snapshot promotion and candidate actions are mutually exclusive across the cluster."
  [f]
  (cluster-lock/with-cluster-lock {:lock ::snapshot-promotion-or-action, :timeout-seconds 30}
    (f)))

(defn candidate
  "Fetch a persisted candidate by id."
  [id]
  (t2/select-one :model/UsageMetadataCandidate :id id))

(defn candidate-table
  "Fetch the physical table targeted by `candidate`."
  [candidate]
  (t2/select-one :model/Table :id (:table_id candidate)))

(defn dismissal-identity
  "Return the durable identity shared by a candidate and its dismissal."
  [candidate]
  (select-keys candidate dismissal-identity-keys))

(defn dismissal-key
  "Return a value suitable for indexing candidates and dismissals by durable identity."
  [candidate]
  (mapv candidate dismissal-identity-keys))

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
        (mapcat (fn [ids]
                  (t2/select [model :id :table_id :name :description :definition]
                             :table_id [:in ids]
                             :archived false))
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
    (app-db/select-or-insert! :model/UsageMetadataCandidateMatch
                              match-keys
                              (constantly match-row))
    (t2/update! :model/UsageMetadataCandidate (:id candidate) {:modeling_status :modeled})
    entity))

(defn dismiss!
  "Create or return the durable instance-wide dismissal for `candidate`."
  [candidate user-id]
  (let [identity (dismissal-identity candidate)]
    (app-db/select-or-insert! :model/UsageMetadataCandidateDismissal
                              identity
                              #(assoc identity
                                      :dismissed_by user-id
                                      :dismissed_at (mi/now)))))

(defn restore!
  "Remove the durable dismissal for `candidate`."
  [candidate]
  (let [{:keys [candidate_type table_id signature_version signature_hash]}
        (dismissal-identity candidate)]
    (t2/delete! :model/UsageMetadataCandidateDismissal
                :candidate_type candidate_type
                :table_id table_id
                :signature_version signature_version
                :signature_hash signature_hash))
  nil)
