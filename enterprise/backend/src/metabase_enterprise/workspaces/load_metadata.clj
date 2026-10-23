(ns metabase-enterprise.workspaces.load-metadata
  "The document a session Metabase creates its Tables and Fields from instead of running its initial sync. The parent
  builds it from its curated metadata ([[build-load-metadata]]). The child reads it from the file its `config.yml`
  names and creates the rows ([[load-metadata-file!]]).

  Rows are matched by name, never by the parent's ids: a database by its config name, a table by schema and name, a
  field by name within its table, an FK target by schema, table and field. Curated values (display names,
  descriptions, semantic types, visibility, FK targets, coercions) go into the user-settings tables, so the child's
  scheduled syncs, which reconcile the warehouse later, don't overwrite them. Fingerprints, FieldValues and nested
  fields aren't carried."
  (:require
   [clojure.java.io :as io]
   [malli.error :as me]
   [medley.core :as m]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.metadata :as ws.metadata]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Document -------------------------------------------------

(mr/def ::fk-target
  [:map {:closed true}
   [:schema {:optional true} :string]
   [:table  ms/NonBlankString]
   [:field  ms/NonBlankString]])

(mr/def ::field
  [:map {:closed true}
   [:name              ms/NonBlankString]
   [:display_name      {:optional true} :string]
   [:description       {:optional true} :string]
   [:base_type         ms/FieldTypeKeywordOrString]
   [:database_type     :string]
   [:position          :int]
   [:database_position :int]
   [:visibility_type   [:enum "normal" "details-only" "sensitive" "hidden" "retired"]]
   [:semantic_type     {:optional true} ms/FieldSemanticOrRelationTypeKeywordOrString]
   ;; both or neither: the effective type a coercion produces
   [:effective_type    {:optional true} ms/FieldTypeKeywordOrString]
   [:coercion_strategy {:optional true} ms/CoercionStrategyKeywordOrString]
   [:fk_target         {:optional true} ::fk-target]])

(mr/def ::table
  [:map {:closed true}
   [:name            ms/NonBlankString]
   [:schema          {:optional true} :string]
   [:display_name    {:optional true} :string]
   [:description     {:optional true} :string]
   [:visibility_type {:optional true} [:enum "hidden" "technical" "cruft"]]
   [:fields          [:sequential ::field]]])

(mr/def ::load-document
  [:map {:closed true}
   [:databases [:sequential [:map {:closed true}
                             [:name   ms/NonBlankString]
                             [:tables [:sequential ::table]]]]]])

;;; --------------------------------------------------- Parent ---------------------------------------------------

(defn- format-field [field fk-target]
  (u/remove-nils
   {:name              (:name field)
    :display_name      (:display_name field)
    :description       (:description field)
    :base_type         (u/qualified-name (:base_type field))
    :database_type     (:database_type field)
    :position          (:position field)
    :database_position (:database_position field)
    :visibility_type   (u/qualified-name (or (:visibility_type field) :normal))
    :semantic_type     (some-> (:semantic_type field) u/qualified-name)
    :effective_type    (when (:coercion_strategy field)
                         (some-> (:effective_type field) u/qualified-name))
    :coercion_strategy (when (:effective_type field)
                         (some-> (:coercion_strategy field) u/qualified-name))
    :fk_target         fk-target}))

(defn- format-table [table fields]
  (u/remove-nils
   {:name            (:name table)
    :schema          (:schema table)
    :display_name    (:display_name table)
    :description     (:description table)
    :visibility_type (some-> (:visibility_type table) u/qualified-name)
    :fields          fields}))

(defn- format-database [db wsd]
  (let [tables       (ws.db/load-metadata-tables (:id db) (ws.metadata/input-schemas db wsd))
        fields       (if (seq tables)
                       (ws.db/load-metadata-fields (mapv :id tables))
                       [])
        table-by-id  (m/index-by :id tables)
        field-by-id  (m/index-by :id fields)
        ;; a target outside the document's tables can't be matched in the child, so it isn't sent
        fk-target    (fn [field-id]
                       (when-let [target (field-by-id field-id)]
                         (let [table (table-by-id (:table_id target))]
                           (u/remove-nils {:schema (:schema table)
                                           :table  (:name table)
                                           :field  (:name target)}))))
        table-fields (group-by :table_id fields)]
    {:name   (:name db)
     :tables (mapv (fn [table]
                     (format-table table
                                   (mapv #(format-field % (some-> (:fk_target_field_id %) fk-target))
                                         (table-fields (:id table) []))))
                   tables)}))

(mu/defn build-load-metadata :- ::load-document
  "The load document for the databases of the workspace with `workspace-id`: their active tables in the workspace's
  input schemas and those tables' active top-level fields, hidden and sensitive ones included so they stay hidden in
  the child, with this instance's curated values."
  [workspace-id :- ms/PositiveInt]
  (let [wsds      (ws.db/workspace-databases workspace-id)
        dbs-by-id (if-let [ids (seq (map :database_id wsds))]
                    (ws.db/database-id->database (vec ids))
                    {})]
    {:databases (mapv #(format-database (dbs-by-id (:database_id %)) %) wsds)}))

;;; --------------------------------------------------- Child ----------------------------------------------------

(defn- read-load-document
  "The load document in the file at `path`, or nil when the file is missing, isn't JSON, or doesn't match
  [[::load-document]]: a malformed document is refused whole."
  [path]
  (let [file (io/file path)]
    (if-not (.isFile file)
      (log/warnf "No load metadata file at %s" path)
      (when-let [document (try
                            (json/decode+kw (slurp file))
                            (catch Exception e
                              (log/warnf e "The load metadata file %s isn't JSON" path)))]
        (if (mr/validate ::load-document document)
          document
          (log/warnf "Refusing the load metadata file %s: %s"
                     path (pr-str (me/humanize (mr/explain ::load-document document)))))))))

(defn- table-row [db-id table]
  {:db_id               db-id
   :schema              (:schema table)
   :name                (:name table)
   :active              true
   :initial_sync_status "complete"})

(defn- field-row [table-id field]
  {:table_id          table-id
   :name              (:name field)
   :base_type         (keyword (:base_type field))
   :database_type     (:database_type field)
   :position          (:position field)
   :database_position (:database_position field)
   :active            true})

(defn- table-settings [table-id table]
  (when-let [settings (not-empty (select-keys table [:display_name :description :visibility_type]))]
    (assoc settings :table_id table-id)))

(defn- field-settings [field-id field fk-target-id]
  (let [{:keys [effective_type coercion_strategy semantic_type]} field]
    (cond-> (assoc (select-keys field [:display_name :description :visibility_type]) :field_id field-id)
      semantic_type                          (assoc :semantic_type (keyword semantic_type))
      (and effective_type coercion_strategy) (assoc :effective_type    (keyword effective_type)
                                                    :coercion_strategy (keyword coercion_strategy))
      fk-target-id                           (assoc :fk_target_field_id fk-target-id))))

(defn- load-database!
  "Create the Tables and Fields of `tables` in the Database with `db-id` and mark it synced, in one transaction."
  [db-id tables]
  (t2/with-transaction [_conn]
    (when (seq tables)
      (ws.db/insert-tables! (mapv #(table-row db-id %) tables)))
    (let [table-ids  (ws.db/table-ids-by-schema-and-name db-id)
          table-id   (fn [table] (table-ids [(:schema table) (:name table)]))
          field-rows (for [table tables, field (:fields table)]
                       (field-row (table-id table) field))
          _          (when (seq field-rows)
                       (ws.db/insert-fields! (vec field-rows)))
          field-ids  (if (seq table-ids)
                       (ws.db/field-ids-by-table-and-name (vec (vals table-ids)))
                       {})
          field-id   (fn [table-id field-name] (field-ids [table-id field-name]))
          fk-id      (fn [{:keys [schema table field]}]
                       (some-> (table-ids [schema table]) (field-id field)))]
      (when-let [settings (seq (keep #(table-settings (table-id %) %) tables))]
        (ws.db/insert-table-user-settings! (vec settings)))
      (when-let [settings (seq (for [table tables, field (:fields table)]
                                 (field-settings (field-id (table-id table) (:name field))
                                                 field
                                                 (some-> (:fk_target field) fk-id))))]
        (ws.db/insert-field-user-settings! (vec settings)))
      (ws.db/mark-database-synced! db-id))))

(defn- loadable?
  "Whether the Database with `db-id` is still empty: its initial sync hasn't completed and it has no Tables. A
  database a sync or an earlier load already filled is left alone."
  [db-id]
  (and (not= "complete" (:initial_sync_status (ws.db/database db-id)))
       (not (ws.db/database-has-tables? db-id))))

(mu/defn load-metadata-file! :- [:set ms/PositiveInt]
  "Create the Tables and Fields of the databases in the load document at `path`, matching each database by name in
  `db-name->id`, and mark them synced. Returns the ids of the databases it loaded; any other database is left to the
  normal sync, as is every database when the document is missing or malformed."
  [path       :- ms/NonBlankString
   db-name->id :- [:map-of :string ms/PositiveInt]]
  (if-let [document (read-load-document path)]
    (into #{}
          (keep (fn [{db-name :name, :keys [tables]}]
                  (let [db-id (db-name->id db-name)]
                    (cond
                      (nil? db-id)
                      (log/warnf "The load metadata file names database %s, which the workspace doesn't" (pr-str db-name))

                      (not (loadable? db-id))
                      (log/infof "Database %s already has metadata; not loading it from the file" (pr-str db-name))

                      :else
                      (try
                        (load-database! db-id tables)
                        (log/infof "Loaded %d table(s) of database %s from the load metadata file"
                                   (count tables) (pr-str db-name))
                        db-id
                        (catch Exception e
                          (log/warnf e "Couldn't load database %s from the load metadata file" (pr-str db-name))))))))
          (:databases document))
    #{}))
