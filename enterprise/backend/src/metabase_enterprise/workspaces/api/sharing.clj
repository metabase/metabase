(ns metabase-enterprise.workspaces.api.sharing
  "Unauthenticated workspace endpoints powered by a sharing key (UUID).
   These follow the same pattern as public card/dashboard sharing —
   the UUID acts as the authorization token."
  (:require
   [metabase-enterprise.workspaces.config :as ws.config]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers -------------------------------------------------------

(defn- workspace-by-sharing-key
  "Look up a workspace by its sharing key. Returns the workspace (hydrated with
   :databases and :creator) or nil."
  [sharing-key]
  (when-let [ws (t2/select-one :model/Workspace :sharing_key sharing-key)]
    (t2/hydrate ws :creator :databases)))

;;; ------------------------------------------------ Endpoints -----------------------------------------------------

(api.macros/defendpoint :get "/:sharing-key/config/yaml"
  "Download workspace config as YAML via sharing key. No authentication required."
  [{:keys [sharing-key]} :- [:map [:sharing-key ms/UUIDString]]]
  (let [ws     (or (workspace-by-sharing-key sharing-key)
                   (throw (ex-info "Not found" {:status-code 404})))
        config (ws.config/build-workspace-config (:id ws))]
    {:status  200
     :headers {"Content-Type"        "application/x-yaml"
               "Content-Disposition" "attachment; filename=\"config.yml\""}
     :body    (ws.config/config->yaml config)}))

(api.macros/defendpoint :get "/:sharing-key/metadata"
  "Get database metadata for a workspace's provisioned databases via sharing key.
   Returns tables limited to the workspace's input and output schemas.
   No authentication required."
  [{:keys [sharing-key]} :- [:map [:sharing-key ms/UUIDString]]]
  (let [ws               (or (workspace-by-sharing-key sharing-key)
                             (throw (ex-info "Not found" {:status-code 404})))
        provisioned-wsds (filter #(= :provisioned (:status %)) (:databases ws))
        db-ids           (mapv :database_id provisioned-wsds)
        dbs-by-id        (when (seq db-ids)
                           (into {} (map (juxt :id identity))
                                 (t2/select :model/Database :id [:in db-ids])))
        tables-by-db     (when (seq db-ids)
                           (group-by :db_id
                                     (t2/select :model/Table
                                                :db_id [:in db-ids]
                                                :active true)))
        table-ids        (mapcat (fn [tables] (map :id tables)) (vals tables-by-db))
        fields-by-table  (when (seq table-ids)
                           (group-by :table_id
                                     (t2/select [:model/Field :id :name :base_type :database_type :semantic_type :table_id]
                                                :table_id [:in table-ids]
                                                :active true)))]
    {:workspace {:name (:name ws)
                 :id   (:id ws)}
     :databases
     (into {}
           (map (fn [wsd]
                  (let [db-id            (:database_id wsd)
                        db               (get dbs-by-id db-id)
                        tables           (get tables-by-db db-id [])
                        relevant-schemas (into #{} (conj (:input_schemas wsd) (:output_schema wsd)))
                        relevant-tables  (filter #(contains? relevant-schemas (:schema %)) tables)]
                    [db-id
                     {:name          (:name db)
                      :engine        (some-> (:engine db) name)
                      :input_schemas (vec (:input_schemas wsd))
                      :output_schema (:output_schema wsd)
                      :tables        (mapv (fn [t]
                                             {:id     (:id t)
                                              :name   (:name t)
                                              :schema (:schema t)
                                              :fields (mapv (fn [f]
                                                              {:id            (:id f)
                                                               :name          (:name f)
                                                               :base_type     (:base_type f)
                                                               :database_type (:database_type f)
                                                               :semantic_type (:semantic_type f)})
                                                            (get fields-by-table (:id t) []))})
                                           relevant-tables)}])))
           provisioned-wsds)}))
