(ns metabase.usage-metadata.candidate-repository
  "Queries and persistence operations for mined candidates and their Library reconciliation state."
  (:require
   [clojure.string :as str]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.usage-metadata.candidate-definitions :as definitions]
   [metabase.usage-metadata.models.candidate]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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

(defn- dismissal-index
  [candidates]
  (let [table-ids (into #{} (map :table_id) candidates)]
    (if (seq table-ids)
      (into {}
            (map (juxt dismissal-key identity))
            (t2/select :model/UsageMetadataCandidateDismissal :table_id [:in table-ids]))
      {})))

(defn- dismissed?
  [dismissals candidate]
  (contains? dismissals (dismissal-key candidate)))

(defn- table-index
  [table-ids]
  (if (seq table-ids)
    (let [tables (t2/select [:model/Table :id :db_id :schema :display_name :active :is_published :collection_id]
                            :id [:in table-ids])
          db-ids (into #{} (keep :db_id) tables)
          dbs     (if (seq db-ids)
                    (t2/select-pk->fn identity :model/Database :id [:in db-ids])
                    {})]
      (into {}
            (map (fn [{:keys [id db_id] :as table}]
                   [id (assoc table :database (select-keys (dbs db_id) [:id :name]))]))
            tables))
    {}))

(defn- candidate-list-joins
  []
  {:from       [[(t2/table-name :model/UsageMetadataCandidate) :candidate]]
   :inner-join [[(t2/table-name :model/Table) :table]
                [:= :candidate.table_id :table.id]
                [(t2/table-name :model/Database) :database]
                [:= :table.db_id :database.id]]
   :left-join  [[(t2/table-name :model/UsageMetadataCandidateDismissal) :dismissal]
                [:and
                 [:= :candidate.candidate_type :dismissal.candidate_type]
                 [:= :candidate.table_id :dismissal.table_id]
                 [:= :candidate.signature_version :dismissal.signature_version]
                 [:= :candidate.signature_hash :dismissal.signature_hash]]]})

(defn- candidate-list-where
  [run-id {:keys [table-id database-id candidate-type queue search]}]
  (cond-> [:and [:= :candidate.run_id run-id]]
    table-id
    (conj [:= :candidate.table_id table-id])

    database-id
    (conj [:= :table.db_id database-id])

    candidate-type
    (conj [:= :candidate.candidate_type (name candidate-type)])

    (= queue :suggested)
    (conj [:= :dismissal.id nil]
          [:!= :candidate.modeling_status (name :modeled)])

    (= queue :used-raw)
    (conj [:= :candidate.modeling_status (name :modeled)])

    (= queue :discarded)
    (conj [:!= :dismissal.id nil]
          [:!= :candidate.modeling_status (name :modeled)])

    (not (str/blank? search))
    (conj (let [pattern (str "%" (u/lower-case-en search) "%")]
            [:or
             [:like [:lower :candidate.suggested_name] pattern]
             [:like [:lower :candidate.display_name] pattern]
             [:like [:lower :candidate.suggested_description] pattern]
             [:like [:lower :table.name] pattern]
             [:like [:lower :table.display_name] pattern]
             [:like [:lower :table.schema] pattern]
             [:like [:lower :database.name] pattern]]))))

(defn candidate-page
  "Return one stable page of candidates from `run-id`, including durable dismissal state."
  [run-id filters {:keys [limit offset]}]
  (let [base-query (merge (candidate-list-joins) {:where (candidate-list-where run-id filters)})
        total      (:total (t2/query-one
                            (assoc base-query :select [[[:count :candidate.id] :total]])))
        ids        (mapv :id
                         (t2/query
                          (assoc base-query
                                 :select [[:candidate.id :id]]
                                 :order-by [[:candidate.sort_position :asc]]
                                 :limit limit
                                 :offset offset)))
        candidates (if (seq ids)
                     (t2/select-pk->fn
                      identity
                      [:model/UsageMetadataCandidate
                       :id :candidate_type :table_id :signature_version :signature_hash
                       :display_name :semantic_details :modeling_status
                       :verified_source_count :official_source_count :popular_source_count
                       :distinct_source_count :recent_view_count]
                      :id [:in ids])
                     {})
        rows        (keep candidates ids)
        dismissals  (dismissal-index rows)]
    {:rows  (mapv #(assoc % :dismissed? (dismissed? dismissals %)) rows)
     :total total}))

(defn table-page
  "Return one stable page of table summaries for candidates in `run-id`."
  [run-id filters {:keys [limit offset]}]
  (let [base-query (merge (candidate-list-joins) {:where (candidate-list-where run-id filters)})
        total      (:total (t2/query-one
                            (assoc base-query
                                   :select [[[:count [:distinct :candidate.table_id]] :total]])))
        counts     (t2/query
                    (assoc base-query
                           :select [[:candidate.table_id :table_id]
                                    [[:count :candidate.id] :candidate_count]]
                           :group-by [:candidate.table_id :table.display_name :table.name]
                           :order-by [[:candidate_count :desc]
                                      [[:lower [:coalesce :table.display_name :table.name]] :asc]
                                      [:candidate.table_id :asc]]
                           :limit limit
                           :offset offset))
        tables     (table-index (into #{} (map :table_id) counts))]
    {:rows  (mapv (fn [{:keys [table_id candidate_count]}]
                    {:table (tables table_id), :candidate-count candidate_count})
                  counts)
     :total total}))

(defn candidate-detail
  "Load the table, provenance, matches, and dismissal state needed to represent `candidate`."
  [candidate]
  (let [candidate-table ((table-index #{(:table_id candidate)}) (:table_id candidate))
        dismissals      (dismissal-index [candidate])
        sources         (t2/select [:model/UsageMetadataCandidateSource
                                    :card_id :card_name :card_type :verified :official :popular
                                    :recent_view_count :joined :stage_numbers :model_lineage]
                                   :candidate_id (:id candidate)
                                   {:order-by [[:card_id :asc]]})
        matches         (t2/select [:model/UsageMetadataCandidateMatch
                                    :relation :entity_id :entity_name :entity_description]
                                   :candidate_id (:id candidate)
                                   {:order-by [[:id :asc]]})]
    {:candidate candidate
     :table candidate-table
     :dismissed? (dismissed? dismissals candidate)
     :sources sources
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
