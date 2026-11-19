(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mr/def ::status
  [:enum :unprovisioned :provisioning :provisioned :deprovisioning :teardown_failed :never_started])

(mr/def ::workspace-database.insert
  [:map {:closed true}
   [:workspace_id     ms/PositiveInt]
   [:database_id      ::lib.schema.id/database]
   [:input_schemas    [:sequential :string]]
   [:database_details ::warehouses.schema/database.connection-details]
   [:output_namespace :string]
   [:status           {:optional true} ::status]
   [:updated_at       {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]])

(mr/def ::workspace-database.update
  [:map {:closed true}
   [:output_namespace {:optional true} :string]
   [:database_details {:optional true} ::warehouses.schema/database.connection-details]
   [:status           {:optional true} ::status]
   [:updated_at       {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]])

(mr/def ::table-spec
  [:map {:closed true}
   [:db     {:optional true} [:maybe :string]]
   [:schema {:optional true} [:maybe :string]]
   [:table  :string]])

;;; ------------------------------------------------- Database -------------------------------------------------

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(defn all-databases
  "Every Database."
  []
  (t2/select :model/Database))

(defn update-database-settings!
  "Replace the `:settings` of the Database with `database-id`."
  [database-id settings]
  (t2/update! :model/Database :id database-id {:settings settings}))

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

(mu/defn active-table-schemas
  "The set of schemas of the active Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :schema :model/Table :db_id database-id :active true))

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

;;; ------------------------------------------------- Workspace ------------------------------------------------

(mu/defn workspace-exists?
  "Whether a Workspace with `workspace-id` exists."
  [workspace-id :- ms/PositiveInt]
  (t2/exists? :model/Workspace :id workspace-id))

(defn any-workspace-exists?
  "Whether any Workspace exists."
  []
  (t2/exists? :model/Workspace))

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

(mu/defn workspace-id-by-idempotency-key :- [:maybe ms/PositiveInt]
  "The id of the Workspace that `creator-id` created with `idempotency-key`, or nil."
  [creator-id      :- ::lib.schema.id/user
   idempotency-key :- :string]
  (t2/select-one-pk :model/Workspace :creator_id creator-id :idempotency_key idempotency-key))

(mu/defn insert-workspace!
  "Insert a Workspace and return its id. Throws a duplicate-key error when `creator-id` already has a Workspace with
  `idempotency-key`."
  [workspace-name  :- :string
   creator-id      :- [:maybe ::lib.schema.id/user]
   idempotency-key :- [:maybe :string]]
  (t2/insert-returning-pk! :model/Workspace {:name            workspace-name
                                             :creator_id      creator-id
                                             :idempotency_key idempotency-key}))

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
  "The WorkspaceDatabases of the Workspace with `workspace-id`, ordered by id."
  [workspace-id :- ms/PositiveInt]
  (t2/select :model/WorkspaceDatabase :workspace_id workspace-id {:order-by [[:id :asc]]}))

(mu/defn workspace-databases-of-workspaces
  "The WorkspaceDatabases of the Workspaces with ids in `workspace-ids`, ordered by id."
  [workspace-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/WorkspaceDatabase :workspace_id [:in workspace-ids] {:order-by [[:id :asc]]}))

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
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status` if it is `from-status`, and its
  `updated_at` to this instance's current time. Returns the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::status
   to-status             :- ::status]
  (t2/update! :model/WorkspaceDatabase {:id workspace-database-id :status from-status}
              {:status to-status :updated_at (mi/current-timestamp)}))

(mu/defn transition-workspace-database-at!
  "Set the status of the WorkspaceDatabase with `workspace-database-id` to `to-status`, and its `updated_at` to
  `updated-at`, if its status is `from-status`. The `UPDATE` statement carries the status condition, so of two
  concurrent calls from the same status only one updates the row. Returns the number of rows updated."
  [workspace-database-id :- ms/PositiveInt
   from-status           :- ::status
   to-status             :- ::status
   updated-at            :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/update! :model/WorkspaceDatabase
              {:id workspace-database-id :status from-status}
              {:status to-status :updated_at updated-at}))

(mu/defn transition-workspace-databases!
  "Set the status of every WorkspaceDatabase of the Workspace with `workspace-id` that is `from-status` to
  `to-status`, and its `updated_at` to this instance's current time. Returns the number of rows updated."
  [workspace-id :- ms/PositiveInt
   from-status  :- ::status
   to-status    :- ::status]
  (t2/update! :model/WorkspaceDatabase {:workspace_id workspace-id :status from-status}
              {:status to-status :updated_at (mi/current-timestamp)}))

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

(mu/defn workspace-has-in-flight-databases?
  "Whether the Workspace with `workspace-id` has a WorkspaceDatabase that is `:provisioning` or `:deprovisioning`, and
  any of its WorkspaceDatabases, whatever its status, was last updated after `since`."
  [workspace-id :- ms/PositiveInt
   since        :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/exists? :model/WorkspaceDatabase
              :workspace_id workspace-id
              :status       [:in [:provisioning :deprovisioning]]
              {:where [:exists ^:allow-subquery {:select [1]
                                                 :from   [[:workspace_database :any_wsd]]
                                                 :where  [:and
                                                          [:= :any_wsd.workspace_id workspace-id]
                                                          [:> :any_wsd.updated_at since]]}]}))

(mu/defn workspace-has-unfinished-databases-since?
  "Whether the Workspace with `workspace-id` has a WorkspaceDatabase that is `:unprovisioned`, `:provisioning` or
  `:deprovisioning`, and any of its WorkspaceDatabases, whatever its status, was last updated after `since`."
  [workspace-id :- ms/PositiveInt
   since        :- (ms/InstanceOfClass java.time.OffsetDateTime)]
  (t2/exists? :model/WorkspaceDatabase
              :workspace_id workspace-id
              :status       [:in [:unprovisioned :provisioning :deprovisioning]]
              {:where [:exists ^:allow-subquery {:select [1]
                                                 :from   [[:workspace_database :any_wsd]]
                                                 :where  [:and
                                                          [:= :any_wsd.workspace_id workspace-id]
                                                          [:> :any_wsd.updated_at since]]}]}))

(mu/defn database-has-workspace-databases?
  "Whether any WorkspaceDatabase references the Database with `database-id`, whatever its status."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/WorkspaceDatabase :database_id database-id))

(mu/defn database-has-active-workspace-databases?
  "Whether the Database with `database-id` has a WorkspaceDatabase that is not `:unprovisioned`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/WorkspaceDatabase :database_id database-id :status [:not= :unprovisioned]))

(mu/defn delete-unprovisioned-workspace-databases-of-database!
  "Delete the `:unprovisioned` WorkspaceDatabases of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/WorkspaceDatabase :database_id database-id :status :unprovisioned))

;;; ---------------------------------------------- TableRemapping ----------------------------------------------
;;;
;;; Each workspace that a request names has its own TableRemappings, with its id in `workspace_id`. The instance's own
;;; have 0 there, which these functions take as a nil `workspace-id`.

(mr/def ::workspace-id
  "The workspace that a request names, or nil for the instance's own TableRemappings."
  [:maybe ms/PositiveInt])

(defn- remapping-workspace-id
  "The `workspace_id` of the TableRemappings of `workspace-id`."
  [workspace-id]
  (or workspace-id 0))

(mu/defn table-remappings
  "The TableRemappings of `workspace-id`, ordered by id."
  [workspace-id :- ::workspace-id]
  (t2/select :model/TableRemapping
             :workspace_id [:auto/param (remapping-workspace-id workspace-id)]
             {:order-by [[:id :asc]]}))

(mu/defn table-remapping-database-ids :- [:set ::lib.schema.id/database]
  "The ids of the Databases that have a TableRemapping of the instance's own."
  []
  ;; `select-fn-set` returns nil, not #{}, when there are no rows
  (set (t2/select-fn-set :database_id :model/TableRemapping :workspace_id 0)))

(mu/defn table-remappings-exist?
  "Whether the Database with `database-id` has a TableRemapping of `workspace-id`."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id]
  (t2/exists? :model/TableRemapping
              :database_id  database-id
              :workspace_id [:auto/param (remapping-workspace-id workspace-id)]))

(mu/defn table-remappings-of-database
  "The TableRemappings of `workspace-id` of the Database with `database-id`."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id]
  (t2/select :model/TableRemapping
             :database_id  database-id
             :workspace_id [:auto/param (remapping-workspace-id workspace-id)]))

(mu/defn table-remapping
  "The TableRemapping of `workspace-id` of the Database with `database-id` whose source is `from-spec`, or nil."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id
   from-spec    :- ::table-spec]
  (t2/select-one :model/TableRemapping
                 :database_id     database-id
                 :workspace_id    [:auto/param (remapping-workspace-id workspace-id)]
                 :from_db         (:db from-spec)
                 :from_schema     (:schema from-spec)
                 :from_table_name (:table from-spec)))

(mu/defn upsert-table-remapping!
  "Make the TableRemapping of `workspace-id` from `from-spec` point at `to-spec`: insert it, or update one that points
  elsewhere, such as a row left from an earlier workspace schema. Leaves a row that already points at `to-spec`
  untouched. Keyed on the unique constraint `(database_id, from_db, from_schema, from_table_name, workspace_id)`:
  [[app-db/update-or-insert!]] retries the lookup when a concurrent insert wins the race."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id
   from-spec    :- ::table-spec
   to-spec      :- ::table-spec]
  (let [to-columns {:to_db         (:db to-spec)
                    :to_schema     (:schema to-spec)
                    :to_table_name (:table to-spec)}]
    (app-db/update-or-insert!
     :model/TableRemapping
     {:database_id     database-id
      :workspace_id    (remapping-workspace-id workspace-id)
      :from_db         (:db from-spec)
      :from_schema     (:schema from-spec)
      :from_table_name (:table from-spec)}
     (fn [existing]
       (when (not= to-columns (select-keys existing (keys to-columns)))
         to-columns)))))

(mu/defn delete-table-remapping!
  "Delete the TableRemapping of `workspace-id` of the Database with `database-id` whose source is `from-spec`.
  Returns the number of rows deleted."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id
   from-spec    :- ::table-spec]
  (t2/delete! :model/TableRemapping
              :database_id     database-id
              :workspace_id    [:auto/param (remapping-workspace-id workspace-id)]
              :from_db         (:db from-spec)
              :from_schema     (:schema from-spec)
              :from_table_name (:table from-spec)))

(mu/defn delete-table-remappings-of-database!
  "Delete the TableRemappings of `workspace-id` of the Database with `database-id`. Returns the number of rows
  deleted."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id]
  (t2/delete! :model/TableRemapping
              :database_id  database-id
              :workspace_id [:auto/param (remapping-workspace-id workspace-id)]))

(mu/defn delete-workspace-table-remappings!
  "Delete the TableRemappings of the workspace with `workspace-id`. Returns the number of rows deleted."
  [workspace-id :- ms/PositiveInt]
  (t2/delete! :model/TableRemapping :workspace_id [:auto/param workspace-id]))

(mu/defn delete-table-remappings-into!
  "Delete the TableRemappings of the Database with `database-id` whose target is in the `(to-db, to-schema)`
  namespace, in every workspace: each workspace has isolation schemas of its own. Returns the number of rows
  deleted."
  [database-id :- ::lib.schema.id/database
   to-db       :- :string
   to-schema   :- :string]
  (t2/delete! :model/TableRemapping :database_id database-id :to_db to-db :to_schema to-schema))

(mu/defn delete-instance-table-remappings!
  "Delete the instance's own TableRemappings, and none of the workspaces that requests name."
  []
  (t2/delete! :model/TableRemapping :workspace_id 0))

;;; ---------------------------------------- Workspace copy metadata -------------------------------------------
;;;
;;; How a workspace's copies differ from the Tables and Fields that every workspace shares. The rows belong to the
;;; workspace that a request names.

(mr/def ::copy-column
  "A column of a copy, as [[metabase.driver/describe-table]] describes it."
  [:map
   [:name              :string]
   [:base-type         :keyword]
   [:database-type     [:maybe :string]]
   [:database-position nat-int?]])

(mr/def ::field-copy
  "The columns of a workspace_field_copy row that a write sets."
  [:map {:closed true}
   [:active            :boolean]
   [:base_type         {:optional true} [:maybe :keyword]]
   [:effective_type    {:optional true} [:maybe :keyword]]
   [:database_type     {:optional true} [:maybe :string]]
   [:database_position {:optional true} [:maybe nat-int?]]])

(mu/defn table-fields :- [:sequential :map]
  "The Fields of the Table with `table-id`, active or not, nested or not, with the columns a copy compares."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name :parent_id :active :base_type :database_type :database_position]
             :table_id [:auto/param table-id]))

(mu/defn top-level-field-id :- [:maybe ::lib.schema.id/field]
  "The id of the top-level Field named `field-name` of the Table with `table-id`, active or not, or nil."
  [table-id   :- ::lib.schema.id/table
   field-name :- :string]
  (t2/select-one-pk :model/Field :table_id [:auto/param table-id] :name field-name :parent_id nil))

(mu/defn insert-inactive-field! :- ::lib.schema.id/field
  "Insert an inactive top-level Field of the Table with `table-id` for the copy column `column`, and return its id."
  [table-id :- ::lib.schema.id/table
   {column-name :name :keys [base-type database-type database-position]} :- ::copy-column]
  (t2/insert-returning-pk! :model/Field {:table_id          table-id
                                         :name              column-name
                                         :display_name      column-name
                                         :base_type         base-type
                                         :database_type     (or database-type "NULL")
                                         :database_position database-position
                                         :position          database-position
                                         :active            false}))

(mu/defn field-copies-of-table :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` of the Fields of the Table with `table-id`."
  [workspace-id :- ms/PositiveInt
   table-id     :- ::lib.schema.id/table]
  (t2/select :model/WorkspaceFieldCopy
             {:select [:workspace_field_copy.*]
              :from   [:workspace_field_copy]
              :join   [:metabase_field [:= :metabase_field.id :workspace_field_copy.field_id]]
              :where  [:and
                       [:= :workspace_field_copy.workspace_id [:auto/param workspace-id]]
                       [:= :metabase_field.table_id [:auto/param table-id]]]}))

(mu/defn insert-field-copies!
  "Insert workspace_field_copy rows of `workspace-id`, from `field-id->columns`, a map of Field id to
  [[::field-copy]]."
  [workspace-id      :- ms/PositiveInt
   field-id->columns :- [:map-of ::lib.schema.id/field ::field-copy]]
  (when (seq field-id->columns)
    (t2/insert! :model/WorkspaceFieldCopy
                (for [[field-id columns] field-id->columns]
                  (assoc columns :workspace_id workspace-id :field_id field-id)))))

(mu/defn update-field-copy!
  "Set the columns of the workspace_field_copy row with `id`."
  [id      :- ms/PositiveInt
   columns :- ::field-copy]
  (t2/update! :model/WorkspaceFieldCopy :id id columns))

(mu/defn delete-field-copies!
  "Delete the workspace_field_copy rows with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (when (seq ids)
    (t2/delete! :model/WorkspaceFieldCopy :id [:in ids])))

(mu/defn upsert-table-copy!
  "Make the Table with `table-id` active in `workspace-id`."
  [workspace-id :- ms/PositiveInt
   table-id     :- ::lib.schema.id/table]
  (app-db/update-or-insert! :model/WorkspaceTableCopy
                            {:workspace_id workspace-id :table_id table-id}
                            (fn [existing] (when-not (:active existing) {:active true}))))

(mu/defn delete-table-copy!
  "Delete the workspace_table_copy row of `workspace-id` of the Table with `table-id`."
  [workspace-id :- ms/PositiveInt
   table-id     :- ::lib.schema.id/table]
  (t2/delete! :model/WorkspaceTableCopy :workspace_id [:auto/param workspace-id] :table_id [:auto/param table-id]))

(mu/defn field-copies-of-database :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` of the Fields of the Database with `database-id`, each with the
  `:table_id` of its Field, and whether that Field is active as `:field_active`."
  [workspace-id :- ms/PositiveInt
   database-id  :- ::lib.schema.id/database]
  (t2/select :model/WorkspaceFieldCopy
             {:select [:workspace_field_copy.* :metabase_field.table_id [:metabase_field.active :field_active]]
              :from   [:workspace_field_copy]
              :join   [:metabase_field [:= :metabase_field.id :workspace_field_copy.field_id]
                       :metabase_table [:= :metabase_table.id :metabase_field.table_id]]
              :where  [:and
                       [:= :workspace_field_copy.workspace_id [:auto/param workspace-id]]
                       [:= :metabase_table.db_id [:auto/param database-id]]]}))

(mu/defn table-copies-of-database :- [:sequential :map]
  "The workspace_table_copy rows of `workspace-id` of the Tables of the Database with `database-id`."
  [workspace-id :- ms/PositiveInt
   database-id  :- ::lib.schema.id/database]
  (t2/select :model/WorkspaceTableCopy
             {:select [:workspace_table_copy.*]
              :from   [:workspace_table_copy]
              :join   [:metabase_table [:= :metabase_table.id :workspace_table_copy.table_id]]
              :where  [:and
                       [:= :workspace_table_copy.workspace_id [:auto/param workspace-id]]
                       [:= :metabase_table.db_id [:auto/param database-id]]]}))

(mu/defn field-copies-of-tables :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` of the Fields of the Tables with `table-ids`, each with the
  `:table_id` of its Field."
  [workspace-id :- ms/PositiveInt
   table-ids    :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/WorkspaceFieldCopy
             {:select [:workspace_field_copy.* :metabase_field.table_id]
              :from   [:workspace_field_copy]
              :join   [:metabase_field [:= :metabase_field.id :workspace_field_copy.field_id]]
              :where  [:and
                       [:= :workspace_field_copy.workspace_id [:auto/param workspace-id]]
                       [:in :metabase_field.table_id table-ids]]}))

(mu/defn table-copies-of-tables :- [:sequential :map]
  "The workspace_table_copy rows of `workspace-id` of the Tables with `table-ids`."
  [workspace-id :- ms/PositiveInt
   table-ids    :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/WorkspaceTableCopy :workspace_id [:auto/param workspace-id] :table_id [:in table-ids]))

(mu/defn inactive-fields :- [:sequential :map]
  "The inactive Fields with `field-ids` that are not retired."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/select :model/Field :id [:in field-ids] :active false :visibility_type [:not= "retired"]))

(mu/defn delete-copies-of-database!
  "Delete the copy rows of `workspace-id` of the Tables and Fields of the Database with `database-id`."
  [workspace-id :- ms/PositiveInt
   database-id  :- ::lib.schema.id/database]
  (let [table-ids ^:allow-subquery {:select [:id] :from [:metabase_table] :where [:= :db_id [:auto/param database-id]]}]
    (t2/delete! :model/WorkspaceFieldCopy
                :workspace_id [:auto/param workspace-id]
                :field_id     [:in ^:allow-subquery {:select [:id]
                                                     :from   [:metabase_field]
                                                     :where  [:in :table_id table-ids]}])
    (t2/delete! :model/WorkspaceTableCopy
                :workspace_id [:auto/param workspace-id]
                :table_id     [:in table-ids])))
