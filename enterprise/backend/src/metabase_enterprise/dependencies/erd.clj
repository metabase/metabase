(ns metabase-enterprise.dependencies.erd
  "Entity Relationship Diagram (ERD) logic: given a set of focal tables,
   fetch their immediate FK neighbors and build a nodes+edges response."
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; -------------------------------------------------- Schema --------------------------------------------------

(mr/def ::erd-field
  [:map
   [:id :int]
   [:name :string]
   [:display_name :string]
   [:database_type :string]
   [:semantic_type {:optional true} [:maybe :string]]
   [:fk_target_field_id {:optional true} [:maybe :int]]
   [:fk_target_table_id {:optional true} [:maybe :int]]])

(mr/def ::erd-node
  [:map
   [:table_id :int]
   [:name :string]
   [:display_name :string]
   [:schema {:optional true} [:maybe :string]]
   [:db_id :int]
   [:is_focal :boolean]
   [:fields [:sequential ::erd-field]]])

(mr/def ::erd-edge
  [:map
   [:source_table_id :int]
   [:source_field_id :int]
   [:target_table_id :int]
   [:target_field_id :int]
   [:relationship [:enum "one-to-one" "many-to-one"]]])

(mr/def ::erd-response
  [:map
   [:nodes [:sequential ::erd-node]]
   [:edges [:sequential ::erd-edge]]])

(mr/def ::erd-request
  [:map
   [:database-id ms/PositiveInt]
   [:table-ids (ms/QueryVectorOf ms/PositiveInt)]])

;;; ---------------------------------------- Fetching tables and fields ----------------------------------------

(defn- fetch-readable-tables
  "Fetch tables by IDs, filtering to only those the user can read.
   Returns {:tables-by-id {id -> table}, :table-ids #{ids}}."
  [table-ids]
  (when (seq table-ids)
    (let [tables   (filter mi/can-read?
                           (t2/select :model/Table :id [:in table-ids] :active true))
          by-id    (into {} (map (fn [t] [(:id t) t])) tables)]
      {:tables-by-id by-id
       :table-ids    (set (keys by-id))})))

(defn- fetch-fields-for-tables
  "Fetch all active, non-retired fields for the given table IDs.
   Returns a vector of field maps."
  [table-ids]
  (when (seq table-ids)
    (t2/select :model/Field
               :table_id [:in table-ids]
               :active true
               :visibility_type [:not= "retired"])))

(defn- discover-fk-targets
  "Given a collection of fields, find FK target field IDs that point to tables
   we haven't loaded yet. Returns the set of new table IDs to fetch.
   Checks `field-by-id` first and only queries the DB for unknown target fields."
  [fields known-table-ids field-by-id]
  (let [target-field-ids (->> fields (keep :fk_target_field_id) set)]
    (if (empty? target-field-ids)
      #{}
      (let [unknown-fids (remove field-by-id target-field-ids)
            ;; Resolve known targets from the accumulated map
            table-ids    (into #{} (keep (comp :table_id field-by-id)) target-field-ids)
            ;; Query DB only for truly unknown target fields
            table-ids    (if (seq unknown-fids)
                           (into table-ids
                                 (map :table_id)
                                 (t2/select :model/Field
                                            :id [:in unknown-fids]
                                            :active true
                                            :visibility_type [:not= "retired"]))
                           table-ids)]
        (set/difference table-ids known-table-ids)))))

(defn- fetch-erd-subgraph
  "Fetch focal tables and their immediate (1-hop) FK neighbors.
   Returns {:tables-by-id, :fields-by-table, :field-by-id, :all-table-ids}."
  [focal-table-ids]
  (let [;; Load focal tables
        {focal-tables :tables-by-id
         focal-ids    :table-ids}  (or (fetch-readable-tables focal-table-ids)
                                       {:tables-by-id {} :table-ids #{}})
        focal-fields               (fetch-fields-for-tables focal-ids)
        focal-fields-by-table      (group-by :table_id focal-fields)
        focal-field-by-id          (into {} (map (fn [f] [(:id f) f])) focal-fields)
        ;; Discover 1-hop FK neighbors
        neighbor-ids               (discover-fk-targets focal-fields focal-ids focal-field-by-id)
        {nbr-tables :tables-by-id
         nbr-ids    :table-ids}    (or (fetch-readable-tables neighbor-ids)
                                       {:tables-by-id {} :table-ids #{}})
        nbr-fields                 (fetch-fields-for-tables nbr-ids)
        nbr-fields-by-table        (group-by :table_id nbr-fields)
        nbr-field-by-id            (into {} (map (fn [f] [(:id f) f])) nbr-fields)
        ;; Merge
        tables-by-id               (merge focal-tables nbr-tables)
        fields-by-table            (merge focal-fields-by-table nbr-fields-by-table)
        field-by-id                (merge focal-field-by-id nbr-field-by-id)]
    {:tables-by-id   tables-by-id
     :fields-by-table fields-by-table
     :field-by-id    field-by-id
     :all-table-ids  (set (keys tables-by-id))}))

;;; ---------------------------------------- Phase 3: Build response ----------------------------------------

(defn build-erd-field
  "Convert a field to the ERD field shape.
   Nils out FK target references when the target table isn't in the visible graph,
   so we don't leak field/table IDs the user can't access."
  [field field-by-id]
  (let [target-table-id (some-> (:fk_target_field_id field) field-by-id :table_id)]
    {:id                 (:id field)
     :name               (:name field)
     :display_name       (:display_name field)
     :database_type      (:database_type field)
     :semantic_type      (some-> (:semantic_type field) u/qualified-name)
     :fk_target_field_id (when target-table-id (:fk_target_field_id field))
     :fk_target_table_id target-table-id}))

(defn build-erd-node
  "Build an ERD node for a table with its fields."
  [table fields is-focal field-by-id]
  {:table_id     (:id table)
   :name         (:name table)
   :display_name (:display_name table)
   :schema       (:schema table)
   :db_id        (:db_id table)
   :is_focal     is-focal
   :fields       (mapv #(build-erd-field % field-by-id) fields)})

(defn build-erd-edges
  "Build ERD edges from fields, filtered to only include edges between visible tables."
  [fields-by-table field-by-id visible-table-ids]
  (let [all-fields (mapcat val fields-by-table)]
    (->> all-fields
         (keep (fn [field]
                 (when-let [target-field-id (:fk_target_field_id field)]
                   (when-let [target-field (field-by-id target-field-id)]
                     (let [target-table (:table_id target-field)]
                       (when (and (contains? visible-table-ids (:table_id field))
                                  (contains? visible-table-ids target-table))
                         {:source_table_id (:table_id field)
                          :source_field_id (:id field)
                          :target_table_id target-table
                          :target_field_id target-field-id
                          :relationship    (if (and (:database_is_pk field)
                                                    (:database_is_pk target-field))
                                             "one-to-one"
                                             "many-to-one")}))))))
         vec)))

(defn build-erd-response
  "Build the ERD response from fetched subgraph data."
  [{:keys [tables-by-id fields-by-table field-by-id all-table-ids]} focal-table-ids]
  (let [nodes (->> all-table-ids
                   (keep (fn [tid]
                           (when-let [table (tables-by-id tid)]
                             (build-erd-node table
                                             (get fields-by-table tid [])
                                             (contains? focal-table-ids tid)
                                             field-by-id))))
                   vec)
        edges (build-erd-edges fields-by-table field-by-id all-table-ids)]
    {:nodes nodes
     :edges edges}))

;;; ---------------------------------------- Main entry point ----------------------------------------

(defn erd
  "Return an ERD for the given focal tables and their immediate FK connections.
   `table-ids` is required — each table becomes a focal point, and all their
   1-hop FK neighbors are included in the response."
  [{:keys [database-id table-ids]}]
  (api/read-check :model/Database database-id)
  (let [focal-table-ids (set table-ids)
        subgraph        (fetch-erd-subgraph focal-table-ids)]
    (build-erd-response subgraph focal-table-ids)))
