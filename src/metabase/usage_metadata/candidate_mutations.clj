(ns metabase.usage-metadata.candidate-mutations
  "Read/write operations on candidates in the current successful snapshot."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.candidate-refresh :as refresh]
   [metabase.usage-metadata.models.candidate]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn candidate-current?
  "Whether `candidate` belongs to the latest successful snapshot."
  [candidate]
  (= (:run_id candidate) (:id (refresh/latest-successful-run))))

(defn candidate
  "Fetch a persisted candidate by id."
  [id]
  (t2/select-one :model/UsageMetadataCandidate :id id))

(defn exact-existing-entity
  "Return the current active Measure or Segment exactly matching `candidate`, if one exists."
  [candidate]
  (some (fn [entity]
          (when (= (:signature candidate)
                   (definitions/existing-signature (:candidate_type candidate)
                                                   (:table_id candidate)
                                                   (:definition entity)))
            entity))
        (definitions/existing-entities (:candidate_type candidate) (:table_id candidate))))

(defn mark-modeled!
  "Record an exact Library entity match and update the current candidate immediately."
  [candidate entity]
  (let [entity-key (case (:candidate_type candidate)
                     :measure :measure_id
                     :segment :segment_id)
        match-keys {:candidate_id (:id candidate)
                    :relation     :exact
                    entity-key    (:id entity)}
        match-row  (definitions/candidate-match-row candidate entity :exact)]
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
                              (select-keys identity [:candidate_type :table_id
                                                     :signature_version :signature_hash])
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
