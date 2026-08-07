(ns metabase-enterprise.data-studio.api.usage-metadata.representations
  "JSON response representations for persisted usage-metadata candidates."
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]))

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

(defn dismissal-key
  "Return the durable identity shared by candidates and dismissals."
  [candidate]
  (mapv candidate [:candidate_type :table_id :signature_version :signature_hash]))

(defn- dismissed?
  [dismissals candidate]
  (contains? dismissals (dismissal-key candidate)))

(defn- candidate-entity-model
  [candidate]
  (case (:candidate_type candidate)
    :measure :model/Measure
    :segment :model/Segment
    nil))

(defn table-editable-for-candidate?
  "Whether the current user may create this candidate type on the table."
  [candidate table]
  (when-let [model (candidate-entity-model candidate)]
    (mi/can-create? model {:table table, :table_id (:id table)})))

(defn table
  "Represent a physical table for cleanup API responses."
  [table]
  {:id             (:id table)
   :db_id          (:db_id table)
   :schema         (:schema table)
   :name           (:name table)
   :display_name   (:display_name table)
   :description    (:description table)
   :data_layer     (:data_layer table)
   :data_authority (:data_authority table)
   :view_count     (long (or (:view_count table) 0))
   :is_published   (boolean (:is_published table))
   :collection_id  (:collection_id table)
   :database       (:database table)})

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

(defn- json-response-value
  [value]
  (cond
    (map? value)        (update-vals value json-response-value)
    (vector? value)     (mapv json-response-value value)
    (sequential? value) (mapv json-response-value value)
    (keyword? value)    (u/qualified-name value)
    :else               value))

(defn- query-definition
  [definition]
  (json-response-value (dissoc definition :lib/metadata)))

(defn candidate-definition
  "Represent a candidate definition without internal Lib metadata."
  [{:keys [candidate_type definition]}]
  (if (= candidate_type :table)
    {:table_id (:table-id definition)}
    (query-definition definition)))

(defn created-entity
  "Represent a Measure or Segment returned after candidate creation."
  [entity]
  (cond-> (select-keys entity [:id :name :table_id :description :archived])
    (:definition entity) (assoc :definition (query-definition (:definition entity)))))

(defn candidate-summary
  "Represent one candidate in list responses."
  [candidate dismissals]
  {:id              (:id candidate)
   :candidate_type  (:candidate_type candidate)
   :display_name    (:display_name candidate)
   :presentation    (candidate-presentation candidate)
   :modeling_status (:modeling_status candidate)
   :dismissed       (dismissed? dismissals candidate)
   :evidence        {:verified_source_count (:verified_source_count candidate)
                     :official_source_count (:official_source_count candidate)
                     :popular_source_count  (:popular_source_count candidate)
                     :distinct_source_count (:distinct_source_count candidate)
                     :total_view_count      (:total_view_count candidate)}})

(defn candidate-detail-summary
  "Represent the shared detail fields and current creation blockers."
  [candidate candidate-table dismissals]
  (let [creation-candidate? (contains? #{:measure :segment} (:candidate_type candidate))
        editable?           (and creation-candidate?
                                 (table-editable-for-candidate? candidate candidate-table))]
    (assoc (candidate-summary candidate dismissals)
           :table (table candidate-table)
           :suggested_name (:suggested_name candidate)
           :suggested_description (:suggested_description candidate)
           :required_tables (mapv required-table
                                  (:required-tables (:semantic_details candidate)))
           :definition (candidate-definition candidate)
           :creation_blockers (cond-> []
                                (and creation-candidate? (not (:is_published candidate-table)))
                                (conj :table-not-published)

                                (and creation-candidate? (not (:active candidate-table)))
                                (conj :table-inactive)

                                (and creation-candidate? (not editable?))
                                (conj :table-uneditable)))))

(defn page
  "Build the standard paginated cleanup response envelope."
  [data total limit offset run]
  {:data data
   :total total
   :limit limit
   :offset offset
   :snapshot (snapshot run)})
