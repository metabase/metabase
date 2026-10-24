(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::status
  [:enum :unprovisioned :provisioning :provisioned :deprovisioning])

(mr/def ::workspace-database.insert
  [:map {:closed true}
   [:workspace_id     ms/PositiveInt]
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential :string]]
   [:database_details ms/DatabaseDetails]
   [:output_namespace :string]
   [:status           {:optional true} ::status]])

(mr/def ::workspace-database.update
  [:map {:closed true}
   [:output_namespace {:optional true} :string]
   [:database_details {:optional true} ms/DatabaseDetails]
   [:status           {:optional true} ::status]])

(mr/def ::table-spec
  [:map {:closed true}
   [:db     {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]
   [:table  :string]])

(mr/def ::table.insert
  [:map {:closed true}
   [:db_id               ::lib.schema.id/database]
   [:schema              [:maybe :string]]
   [:name                :string]
   [:active              :boolean]
   [:initial_sync_status :string]])

(mr/def ::field.insert
  [:map {:closed true}
   [:table_id          ::lib.schema.id/table]
   [:name              :string]
   [:base_type         :keyword]
   [:effective_type    :keyword]
   [:database_type     :string]
   [:position          :int]
   [:database_position :int]
   [:active            :boolean]])

(mr/def ::table-user-settings.insert
  [:map {:closed true}
   [:table_id        ::lib.schema.id/table]
   [:display_name    {:optional true} :string]
   [:description     {:optional true} :string]
   [:visibility_type {:optional true} :string]])

(mr/def ::field-user-settings.insert
  [:map {:closed true}
   [:field_id           ::lib.schema.id/field]
   [:display_name       {:optional true} :string]
   [:description        {:optional true} :string]
   [:visibility_type    {:optional true} :string]
   [:semantic_type      {:optional true} :keyword]
   [:effective_type     {:optional true} :keyword]
   [:coercion_strategy  {:optional true} :keyword]
   [:fk_target_field_id {:optional true} ::lib.schema.id/field]])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-engine
  "The `:engine` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn databases
  "The Databases with ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-id->database
  "Map of id to Database for the ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-pk->fn identity :model/Database :id [:in database-ids]))

(mu/defn databases-with-settings
  "Every Database's `:id`, `:engine` and `:settings`."
  []
  (t2/select [:model/Database :id :engine :settings]))

(mu/defn active-table-schemas
  "The set of schemas of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn sample-database-exists?
  "Whether the sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn stub-candidate-databases
  "Databases other than the sample, audit and routing-destination ones whose ids are not in `excluded-ids`."
  [excluded-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database
             {:where [:and
                      [:= :is_sample false]
                      [:= :is_audit  false]
                      [:= :router_database_id nil]
                      (if (seq excluded-ids)
                        [:not-in :id excluded-ids]
                        true)]}))

;;; ------------------------------------------------- Metadata -------------------------------------------------

(mu/defn metadata-tables
  "The active, visible Tables of the Database with `database-id`, as users see them (user-set values merged in),
  restricted to `schemas` unless it is nil."
  [database-id :- ::lib.schema.id/database
   schemas     :- [:maybe [:sequential :string]]]
  (t2/select [:model/Table :id :db_id :name :schema :description]
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:and
                         [:= :db_id database-id]
                         [:= :active true]
                         [:= :visibility_type nil]
                         (if schemas [:in :schema schemas] true)]
              :order-by [:id]}))

(mu/defn metadata-fields
  "The active Fields of the Tables with ids in `table-ids` whose visibility is normal or details-only (not hidden,
  sensitive or retired), as users see them (user-set values merged in)."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Field :id :table_id :name :description :base_type :database_type :effective_type
              :semantic_type :coercion_strategy :nfc_path :parent_id :fk_target_field_id]
             {:from     [(warehouse-schema-overlay/field-query)]
              :where    [:and
                         [:in :table_id table-ids]
                         [:= :active true]
                         [:in :visibility_type ["normal" "details-only"]]]
              :order-by [:id]}))

;;; ------------------------------------------------ Load metadata -----------------------------------------------

(mu/defn load-metadata-tables
  "The active Tables of the Database with `database-id`, hidden ones included, as users see them (user-set values
  merged in), restricted to `schemas` unless it is nil."
  [database-id :- ::lib.schema.id/database
   schemas     :- [:maybe [:sequential :string]]]
  (t2/select [:model/Table :id :name :schema :display_name :description :visibility_type]
             {:from     [(warehouse-schema-overlay/table-query)]
              :where    [:and
                         [:= :db_id database-id]
                         [:= :active true]
                         (if schemas [:in :schema schemas] true)]
              :order-by [:schema :name]}))

(mu/defn load-metadata-fields
  "The active top-level Fields of the Tables with ids in `table-ids`, whatever their visibility, as users see them
  (user-set values merged in)."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/Field :id :table_id :name :display_name :description :base_type :effective_type
              :coercion_strategy :database_type :semantic_type :visibility_type :position :database_position
              :fk_target_field_id]
             {:from     [(warehouse-schema-overlay/field-query)]
              :where    [:and
                         [:in :table_id table-ids]
                         [:= :active true]
                         [:= :parent_id nil]]
              :order-by [:table_id :database_position :name]}))

(mu/defn database-has-tables?
  "Whether the Database with `database-id` has any Table rows."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id
              {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn insert-tables!
  "Insert the Table rows `tables`."
  [tables :- [:sequential ::table.insert]]
  (t2/insert! :model/Table tables))

(mu/defn table-ids-by-schema-and-name
  "Map of `[schema name]` to id for the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (into {}
        (map (juxt (juxt :schema :name) :id))
        (t2/select [:model/Table :id :schema :name] :db_id database-id
                   {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]})))

(mu/defn insert-fields!
  "Insert the Field rows `fields`."
  [fields :- [:sequential ::field.insert]]
  (t2/insert! :model/Field fields))

(mu/defn field-ids-by-table-and-name
  "Map of `[table-id name]` to id for the top-level Fields of the Tables with ids in `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (into {}
        (map (juxt (juxt :table_id :name) :id))
        (t2/select [:model/Field :id :table_id :name] :table_id [:in table-ids] :parent_id nil
                   {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]})))

(mu/defn insert-table-user-settings!
  "Insert the TableUserSettings rows `settings`, one statement per set of columns: a multi-row insert writes NULL for a
  column a row leaves out, and the insert hook only sets the `_set` flags of the columns a row has."
  [settings :- [:sequential ::table-user-settings.insert]]
  (doseq [rows (vals (group-by (comp set keys) settings))]
    (t2/insert! :model/TableUserSettings rows)))

(mu/defn insert-field-user-settings!
  "Insert the FieldUserSettings rows `settings`, one statement per set of columns: a multi-row insert writes NULL for a
  column a row leaves out, and the insert hook only sets the `_set` flags of the columns a row has."
  [settings :- [:sequential ::field-user-settings.insert]]
  (doseq [rows (vals (group-by (comp set keys) settings))]
    (t2/insert! :model/FieldUserSettings rows)))

(mu/defn mark-database-synced!
  "Set the Database with `database-id`'s initial sync status to complete."
  [database-id :- ::lib.schema.id/database]
  (t2/update! :model/Database database-id {:initial_sync_status "complete"}))

;;; ------------------------------------------------- Workspace ------------------------------------------------

(mu/defn workspace-exists?
  "Whether a Workspace with `workspace-id` exists."
  [workspace-id :- ms/PositiveInt]
  (t2/exists? :model/Workspace :id workspace-id))

(mu/defn workspace
  "The Workspace with `workspace-id`, or nil."
  [workspace-id :- ms/PositiveInt]
  (t2/select-one :model/Workspace :id workspace-id))

(mu/defn workspace-by-name
  "The lowest-id Workspace named `workspace-name`, or nil."
  [workspace-name :- :string]
  (t2/select-one :model/Workspace :name workspace-name {:order-by [[:id :asc]]}))

(mu/defn workspaces
  "Every Workspace, ordered by id."
  []
  (t2/select :model/Workspace {:order-by [[:id :asc]]}))

(mu/defn insert-workspace!
  "Insert a Workspace and return its id."
  [workspace-name :- :string
   creator-id     :- [:maybe ::lib.schema.id/user]]
  (t2/insert-returning-pk! :model/Workspace {:name workspace-name :creator_id creator-id}))

(mu/defn update-workspace-name!
  "Rename the Workspace with `workspace-id`."
  [workspace-id   :- ms/PositiveInt
   workspace-name :- :string]
  (t2/update! :model/Workspace :id workspace-id {:name workspace-name}))

(mu/defn delete-workspace!
  "Delete the Workspace with `workspace-id`."
  [workspace-id :- ms/PositiveInt]
  (t2/delete! :model/Workspace :id workspace-id))

(mu/defn creators
  "The Users with ids in `user-ids`, with the columns a Workspace's `:creator` exposes."
  [user-ids :- [:sequential ::lib.schema.id/user]]
  (t2/select [:model/User :id :first_name :last_name :email :common_name] :id [:in user-ids]))

;;; --------------------------------------------- WorkspaceDatabase --------------------------------------------

(mu/defn workspace-database
  "The WorkspaceDatabase with `workspace-database-id`, or nil."
  [workspace-database-id :- ms/PositiveInt]
  (t2/select-one :model/WorkspaceDatabase :id workspace-database-id))

(mu/defn workspace-databases
  "The WorkspaceDatabases of the Workspace with `workspace-id`."
  [workspace-id :- ms/PositiveInt]
  (t2/select :model/WorkspaceDatabase :workspace_id workspace-id))

(mu/defn workspace-databases-of-workspaces
  "The WorkspaceDatabases of the Workspaces with ids in `workspace-ids`."
  [workspace-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/WorkspaceDatabase :workspace_id [:in workspace-ids]))

(mu/defn workspace-database-ids-with-status
  "The ids of the WorkspaceDatabases of the Workspace with `workspace-id` whose status is `status`."
  [workspace-id :- ms/PositiveInt
   status       :- ::status]
  (t2/select-pks-vec :model/WorkspaceDatabase :workspace_id workspace-id :status status))

(mu/defn insert-workspace-databases!
  "Insert `rows`."
  [rows :- [:sequential ::workspace-database.insert]]
  (t2/insert! :model/WorkspaceDatabase rows))

(mu/defn update-workspace-database!
  "Apply `changes` to the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt
   changes               :- ::workspace-database.update]
  (t2/update! :model/WorkspaceDatabase {:id workspace-database-id} changes))

(mu/defn transition-workspace-database!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status` if it is `from-status`.
  Returns the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::status
   to-status             :- ::status]
  (t2/update! :model/WorkspaceDatabase {:id workspace-database-id :status from-status} {:status to-status}))

(mu/defn transition-workspace-databases!
  "Set the status of every WorkspaceDatabase of the Workspace with `workspace-id` that is `from-status` to
  `to-status`. Returns the number of rows updated."
  [workspace-id :- ms/PositiveInt
   from-status  :- ::status
   to-status    :- ::status]
  (t2/update! :model/WorkspaceDatabase {:workspace_id workspace-id :status from-status} {:status to-status}))

(mu/defn delete-workspace-database!
  "Delete the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt]
  (t2/delete! :model/WorkspaceDatabase :id workspace-database-id))

(mu/defn delete-workspace-databases!
  "Delete the WorkspaceDatabases with ids in `workspace-database-ids`."
  [workspace-database-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/WorkspaceDatabase :id [:in workspace-database-ids]))

(mu/defn workspace-has-active-databases?
  "Whether the Workspace with `workspace-id` has a WorkspaceDatabase that is not `:unprovisioned`."
  [workspace-id :- ms/PositiveInt]
  (t2/exists? :model/WorkspaceDatabase :workspace_id workspace-id :status [:not= :unprovisioned]))

(mu/defn database-has-active-workspace-databases?
  "Whether the Database with `database-id` has a WorkspaceDatabase that is not `:unprovisioned`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/WorkspaceDatabase :database_id database-id :status [:not= :unprovisioned]))

(mu/defn delete-unprovisioned-workspace-databases-of-database!
  "Delete the `:unprovisioned` WorkspaceDatabases of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/WorkspaceDatabase :database_id database-id :status :unprovisioned))

;;; ---------------------------------------------- TableRemapping ----------------------------------------------

(mu/defn table-remappings
  "Every TableRemapping, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(mu/defn table-remappings-exist?
  "Whether the Database with `database-id` has a TableRemapping."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/TableRemapping :database_id database-id))

(mu/defn table-remappings-of-database
  "The TableRemappings of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/TableRemapping :database_id database-id))

(mu/defn table-remapping
  "The TableRemapping of the Database with `database-id` whose source is `from-spec`, or nil."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec]
  (t2/select-one :model/TableRemapping
                 :database_id     database-id
                 :from_db         (:db from-spec)
                 :from_schema     (:schema from-spec)
                 :from_table_name (:table from-spec)))

(mu/defn upsert-table-remapping!
  "Insert a TableRemapping from `from-spec` to `to-spec` unless one from `from-spec` already exists. Idempotent on the
  unique constraint `(database_id, from_db, from_schema, from_table_name)`: [[app-db/update-or-insert!]] retries the
  lookup when a concurrent insert wins the race."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec
   to-spec     :- ::table-spec]
  (app-db/update-or-insert!
   :model/TableRemapping
   {:database_id     database-id
    :from_db         (:db from-spec)
    :from_schema     (:schema from-spec)
    :from_table_name (:table from-spec)}
   (fn [existing]
     (when-not existing
       {:to_db         (:db to-spec)
        :to_schema     (:schema to-spec)
        :to_table_name (:table to-spec)}))))

(mu/defn delete-table-remapping!
  "Delete the TableRemapping of the Database with `database-id` whose source is `from-spec`. Returns the number of
  rows deleted."
  [database-id :- ::lib.schema.id/database
   from-spec   :- ::table-spec]
  (t2/delete! :model/TableRemapping
              :database_id     database-id
              :from_db         (:db from-spec)
              :from_schema     (:schema from-spec)
              :from_table_name (:table from-spec)))

(mu/defn delete-table-remappings-of-database!
  "Delete the TableRemappings of the Database with `database-id`. Returns the number of rows deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/TableRemapping :database_id database-id))

(mu/defn delete-table-remappings-into!
  "Delete the TableRemappings of the Database with `database-id` whose target is in the `(to-db, to-schema)`
  namespace. Returns the number of rows deleted."
  [database-id :- ::lib.schema.id/database
   to-db       :- :string
   to-schema   :- :string]
  (t2/delete! :model/TableRemapping :database_id database-id :to_db to-db :to_schema to-schema))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping."
  []
  (t2/delete! :model/TableRemapping))
