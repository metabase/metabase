(ns metabase-enterprise.data-studio.api.usage-metadata.queries
  "Read queries and detail assembly for the usage-metadata cleanup API."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-studio.api.usage-metadata.representations :as representations]
   [metabase.api.common :as api]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private default-limit 50)
(def ^:private max-limit 200)

(defn paging
  "Return validated request pagination."
  []
  (let [limit (or (request/limit) default-limit)]
    (api/check-400 (<= limit max-limit) "limit must not exceed 200")
    {:limit limit, :offset (or (request/offset) 0)}))

(defn dismissal-index
  "Load dismissals relevant to candidates and index them by durable identity."
  [candidates]
  (let [table-ids (into #{} (map :table_id) candidates)]
    (if (seq table-ids)
      (into {}
            (map (juxt representations/dismissal-key identity))
            (t2/select :model/UsageMetadataCandidateDismissal :table_id [:in table-ids]))
      {})))

(defn table-index
  "Load table response dependencies and index them by table id."
  [table-ids]
  (if (seq table-ids)
    (let [tables (t2/select [:model/Table :id :db_id :schema :name :display_name :description
                             :data_layer :data_authority :view_count :active
                             :is_published :collection_id]
                            :id [:in table-ids])
          db-ids (into #{} (keep :db_id) tables)
          dbs     (if (seq db-ids)
                    (t2/select-pk->fn identity :model/Database :id [:in db-ids])
                    {})
          collection-ids (into #{} (keep :collection_id) tables)
          collections    (if (seq collection-ids)
                           (t2/select-pk->fn identity :model/Collection :id [:in collection-ids])
                           {})]
      (into {}
            (map (fn [{:keys [id db_id] :as table}]
                   [id (assoc table
                              :database (select-keys (dbs db_id) [:id :name])
                              :collection (collections (:collection_id table)))]))
            tables))
    {}))

(defn- candidate-joins
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

(defn- candidate-where
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
          [:!= :candidate.modeling_status "modeled"])

    (= queue :used-raw)
    (conj [:= :candidate.modeling_status "modeled"])

    (= queue :discarded)
    (conj [:!= :dismissal.id nil]
          [:!= :candidate.modeling_status "modeled"])

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
  "Query one stable page of candidates from a successful snapshot."
  [run opts]
  (let [{:keys [limit offset]} (paging)
        base-query (merge (candidate-joins) {:where (candidate-where (:id run) opts)})
        total      (:total (t2/query-one
                            (assoc base-query :select [[[:count :candidate.id] :total]])))
        ids        (mapv :id
                         (t2/query
                          (assoc base-query
                                 :select [[:candidate.id :id]]
                                 :order-by [[:candidate.family_order :asc]
                                            [:candidate.family_position :asc]]
                                 :limit limit
                                 :offset offset)))
        candidates (if (seq ids)
                     (t2/select-pk->fn
                      identity
                      [:model/UsageMetadataCandidate
                       :id :candidate_type :table_id :signature_version :signature_hash
                       :display_name :semantic_details :modeling_status
                       :verified_source_count :official_source_count :popular_source_count
                       :distinct_source_count :total_view_count]
                      :id [:in ids])
                     {})]
    {:rows (mapv candidates ids), :total total, :limit limit, :offset offset}))

(defn table-page
  "Query one stable page of table summaries from a successful snapshot."
  [run opts]
  (let [{:keys [limit offset]} (paging)
        base-query (merge (candidate-joins) {:where (candidate-where (:id run) opts)})
        total      (:total (t2/query-one
                            (assoc base-query
                                   :select [[[:count [:distinct :candidate.table_id]] :total]])))
        rows       (t2/query
                    (assoc base-query
                           :select [[:candidate.table_id :table_id]
                                    [[:count :candidate.id] :candidate_count]]
                           :group-by [:candidate.table_id :table.display_name :table.name]
                           :order-by [[:candidate_count :desc]
                                      [[:lower [:coalesce :table.display_name :table.name]] :asc]
                                      [:candidate.table_id :asc]]
                           :limit limit
                           :offset offset))]
    {:rows rows, :total total, :limit limit, :offset offset}))

(defn candidate-detail
  "Load and represent complete provenance, matches, and dismissal state."
  [candidate]
  (let [candidate-table ((table-index #{(:table_id candidate)}) (:table_id candidate))
        dismissals      (dismissal-index [candidate])
        sources         (t2/select :model/UsageMetadataCandidateSource
                                   :candidate_id (:id candidate)
                                   {:order-by [[:card_id :asc]]})
        matches         (t2/select :model/UsageMetadataCandidateMatch
                                   :candidate_id (:id candidate)
                                   {:order-by [[:id :asc]]})
        dismissal       (dismissals (representations/dismissal-key candidate))
        dependency-paths (into {}
                               (map (juxt :card-id :dependency-paths))
                               (get-in candidate [:semantic_details :source-dependencies]))]
    (assoc (representations/candidate-detail-summary candidate candidate-table dismissals)
           :dismissal (some-> dismissal
                              (select-keys [:id :dismissed_by :dismissed_at :reason]))
           :sources (mapv (fn [source]
                            (cond-> (select-keys source [:id :candidate_id :card_id :card_name :card_type
                                                         :verified :official :popular :view_count :joined
                                                         :stage_numbers :model_lineage])
                              (contains? dependency-paths (:card_id source))
                              (assoc :dependency_paths
                                     (mapv (fn [{:keys [direct? models]}]
                                             {:direct direct?, :models models})
                                           (dependency-paths (:card_id source))))))
                          sources)
           :matches (mapv (fn [{:keys [relation measure_id segment_id entity_name entity_description
                                       entity_archived]}]
                            {:relation relation
                             :entity_type (if measure_id :measure :segment)
                             :entity {:id (or measure_id segment_id)
                                      :name entity_name
                                      :description entity_description
                                      :archived entity_archived}})
                          matches))))
