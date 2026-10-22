(ns metabase-enterprise.workspaces.metadata
  "The workspace's warehouse metadata as `table_metadata.json`: the flat `{databases, tables, fields}` document the
  `@metabase/database-metadata` extractor reads (the metabase-database-metadata agent skill). References between
  rows are the parent's numeric ids (`db_id`, `table_id`, `parent_id`, `fk_target_field_id`); the extractor turns
  them into natural keys and drops references it can't resolve."
  (:require
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]))

(defn- input-schemas
  "The schemas to read `db`'s tables from, or nil for every schema: engines without schemas (MySQL) list the bound
  database in `:input_schemas`, which no Table's `:schema` matches."
  [db wsd]
  (when (driver.u/supports? (:engine db) :schemas db)
    (vec (:input_schemas wsd))))

(defn- format-database [db]
  {:id     (:id db)
   :name   (:name db)
   :engine (u/qualified-name (:engine db))})

(defn- format-table [table]
  (u/remove-nils (select-keys table [:id :db_id :name :schema :description])))

(defn- format-field
  "`effective_type` only when coercion makes it differ from `base_type`, as the format specifies."
  [{:keys [base_type effective_type nfc_path] :as field}]
  (-> (select-keys field [:id :table_id :name :description :database_type :parent_id :fk_target_field_id])
      (assoc :base_type         (some-> base_type u/qualified-name)
             :effective_type    (when (not= base_type effective_type)
                                  (some-> effective_type u/qualified-name))
             :semantic_type     (some-> (:semantic_type field) u/qualified-name)
             :coercion_strategy (some-> (:coercion_strategy field) u/qualified-name)
             :nfc_path          (seq nfc_path))
      u/remove-nils))

(defn build-workspace-metadata
  "The `table_metadata.json` document for the databases of the workspace with `workspace-id`: their active, visible
  tables in the workspace's input schemas and those tables' active, visible fields, with the parent's curated values
  (descriptions, semantic types)."
  [workspace-id]
  (let [wsds      (ws.db/workspace-databases workspace-id)
        dbs-by-id (if-let [ids (seq (map :database_id wsds))]
                    (ws.db/database-id->database (vec ids))
                    {})
        tables    (into []
                        (mapcat (fn [wsd]
                                  (let [db (get dbs-by-id (:database_id wsd))]
                                    (ws.db/metadata-tables (:id db) (input-schemas db wsd)))))
                        wsds)
        fields    (if-let [table-ids (seq (map :id tables))]
                    (ws.db/metadata-fields (vec table-ids))
                    [])]
    {:databases (mapv (comp format-database dbs-by-id :database_id) wsds)
     :tables    (mapv format-table tables)
     :fields    (mapv format-field fields)}))
