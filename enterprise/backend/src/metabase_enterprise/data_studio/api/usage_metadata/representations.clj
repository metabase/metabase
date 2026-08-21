(ns metabase-enterprise.data-studio.api.usage-metadata.representations
  "JSON response representations for persisted usage-metadata candidates.")

(defn snapshot
  "Represent a successful snapshot for API responses."
  [run]
  (when run
    {:id          (:id run)
     :finished_at (:finished_at run)
     :summary     (when-let [summary (:summary run)]
                    {:table_count (:table-count summary)})}))

(defn run-state
  "Represent the polling state of an active or failed run."
  [run]
  (when run
    (select-keys run [:id :status])))

(defn table
  "Represent a physical table for cleanup API responses."
  [table]
  {:id           (:id table)
   :schema       (:schema table)
   :display_name (:display_name table)
   :is_published (boolean (:is_published table))
   :database     (:database table)})

(defn- presented-atom
  [{:keys [signature display-name kind]}]
  {:signature signature, :display_name display-name, :kind kind})

(defn- required-table
  [table]
  {:id           (:id table)
   :schema       (:schema table)
   :display_name (:display-name table)
   :is_published (:published? table)
   :database     {:id (:database-id table), :name (:database-name table)}})

(defn- candidate-presentation
  [{:keys [candidate_type semantic_details]}]
  (let [predicates (:display-atoms semantic_details)]
    (cond-> {:predicates (mapv presented-atom predicates)}
      (= candidate_type :measure)
      (assoc :aggregation {:display_name (:base-name semantic_details)}))))

(defn- candidate-definition
  [{:keys [candidate_type definition]}]
  (if (= candidate_type :table)
    {:table_id (:table-id definition)}
    definition))

(defn candidate-summary
  "Represent one candidate in list responses."
  [candidate dismissed?]
  {:id              (:id candidate)
   :candidate_type  (:candidate_type candidate)
   :display_name    (:display_name candidate)
   :presentation    (candidate-presentation candidate)
   :modeling_status (:modeling_status candidate)
   :dismissed       dismissed?
   :evidence        {:verified_source_count (:verified_source_count candidate)
                     :official_source_count (:official_source_count candidate)
                     :popular_source_count  (:popular_source_count candidate)
                     :distinct_source_count (:distinct_source_count candidate)
                     :recent_view_count      (:recent_view_count candidate)}})

(defn- candidate-detail-summary
  [candidate candidate-table dismissed? creation-blockers]
  (assoc (candidate-summary candidate dismissed?)
         :table (table candidate-table)
         :suggested_name (:suggested_name candidate)
         :suggested_description (:suggested_description candidate)
         :required_tables (mapv required-table
                                (:required-tables (:semantic_details candidate)))
         :definition (candidate-definition candidate)
         :creation_blockers creation-blockers))

(defn candidate-detail
  "Represent complete candidate provenance and Library matches."
  [{:keys [candidate table dismissed? sources matches]} creation-blockers]
  (let [dependency-paths (into {}
                               (map (juxt :card-id :dependency-paths))
                               (get-in candidate [:semantic_details :source-dependencies]))]
    (assoc (candidate-detail-summary candidate table dismissed? creation-blockers)
           :sources (mapv (fn [source]
                            (cond-> (select-keys source [:card_id :card_name :card_type :verified :official
                                                         :popular :recent_view_count :joined
                                                         :stage_numbers :model_lineage])
                              (contains? dependency-paths (:card_id source))
                              (assoc :dependency_paths
                                     (mapv (fn [{:keys [direct? models]}]
                                             {:direct direct?, :models models})
                                           (dependency-paths (:card_id source))))))
                          sources)
           :matches (mapv (fn [{:keys [relation entity_id entity_name entity_description]}]
                            {:relation relation
                             :entity_type (:candidate_type candidate)
                             :entity {:id entity_id
                                      :name entity_name
                                      :description entity_description}})
                          matches))))

(defn page
  "Build the standard paginated cleanup response envelope."
  [data total limit offset run]
  {:data data
   :total total
   :limit limit
   :offset offset
   :snapshot (snapshot run)})
