(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
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

(mr/def ::workspace-database.update
  "What an update of a WorkspaceDatabase takes: its `:id` and the columns to change, each optional."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:workspace_id     {:optional true} ms/PositiveInt]
   [:database_id      {:optional true} ::lib.schema.id/database]
   [:input_schemas    {:optional true} [:sequential :string]]
   [:database_details {:optional true} ::warehouses.schema/database.connection-details]
   [:output_namespace {:optional true} :string]
   [:status           {:optional true} ::status]
   [:updated_at       {:optional true} (ms/InstanceOfClass java.time.OffsetDateTime)]])

(mr/def ::workspace-database.create
  "What creating a WorkspaceDatabase takes: the columns of an update without the `:id`, and its Workspace, Database,
  input schemas, connection details and output namespace."
  [:merge
   (mut/dissoc ::workspace-database.update :id)
   [:map
    [:workspace_id     ms/PositiveInt]
    [:database_id      ::lib.schema.id/database]
    [:input_schemas    [:sequential :string]]
    [:database_details ::warehouses.schema/database.connection-details]
    [:output_namespace :string]]])

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

(mu/defn database-engine
  "The `:engine` of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn databases
  "The Databases with ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (app-db/select-batched #(t2/select :model/Database :id [:in %]) database-ids))

(mu/defn database-id->database
  "Map of id to Database for the ids in `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (app-db/select-batched-map #(t2/select-pk->fn identity :model/Database :id [:in %]) database-ids))

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
  (app-db/select-batched #(t2/select [:model/User :id :first_name :last_name :email :common_name] :id [:in %])
                         user-ids))

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
  (vec (sort-by :id (app-db/select-batched #(t2/select :model/WorkspaceDatabase :workspace_id [:in %]
                                                       {:order-by [[:id :asc]]})
                                           workspace-ids))))

(mu/defn workspace-database-ids-with-status
  "The ids of the WorkspaceDatabases of the Workspace with `workspace-id` whose status is `status`."
  [workspace-id :- ms/PositiveInt
   status       :- ::status]
  (t2/select-pks-vec :model/WorkspaceDatabase :workspace_id workspace-id :status status))

(mu/defn insert-workspace-databases!
  "Insert `rows`."
  [rows :- [:sequential ::workspace-database.create]]
  (t2/insert! :model/WorkspaceDatabase rows))

(mu/defn update-workspace-database!
  "Apply `changes` to the WorkspaceDatabase with `workspace-database-id`."
  [workspace-database-id :- ms/PositiveInt
   changes               :- (mut/select-keys ::workspace-database.update
                                             [:output_namespace :database_details :status :updated_at])]
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
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/WorkspaceDatabase :id [:in %]) workspace-database-ids))

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
                                                 :from   [[(t2/table-name :model/WorkspaceDatabase) :any_wsd]]
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
                                                 :from   [[(t2/table-name :model/WorkspaceDatabase) :any_wsd]]
                                                 :where  [:and
                                                          [:= :any_wsd.workspace_id workspace-id]
                                                          [:> :any_wsd.updated_at since]]}]}))

(mu/defn database-has-workspace-databases?
  "Whether any WorkspaceDatabase references the Database with `database-id`, whatever its status."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/WorkspaceDatabase :database_id database-id))

(mu/defn database-id-with-active-workspace-databases :- [:maybe ::lib.schema.id/database]
  "The id of one of the Databases with `database-ids` that has a WorkspaceDatabase that is not `:unprovisioned`, or
  nil."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (first (sort (app-db/select-batched #(some-> (t2/select-one-fn :database_id :model/WorkspaceDatabase
                                                                 :database_id [:in %]
                                                                 :status [:not= :unprovisioned]
                                                                 {:order-by [[:database_id :asc]]})
                                               vector)
                                      database-ids))))

(mu/defn delete-unprovisioned-workspace-databases-of-databases!
  "Delete the `:unprovisioned` WorkspaceDatabases of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/WorkspaceDatabase :database_id [:in %] :status :unprovisioned) database-ids))

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
             :workspace_id (remapping-workspace-id workspace-id)
             {:order-by [[:id :asc]]}))

(mu/defn table-remapping-database-ids :- [:set ::lib.schema.id/database]
  "The ids of the Databases that have a TableRemapping of the instance's own."
  []
  ;; `select-fn-set` returns nil, not #{}, when there are no rows
  (set (t2/select-fn-set :database_id :model/TableRemapping :workspace_id 0)))

(mu/defn workspace-table-remapping-database-ids :- [:set ::lib.schema.id/database]
  "The ids of the Databases that have a TableRemapping of the workspace with `workspace-id`."
  [workspace-id :- ms/PositiveInt]
  (set (t2/select-fn-set :database_id :model/TableRemapping :workspace_id workspace-id)))

(mu/defn table-remappings-exist?
  "Whether the Database with `database-id` has a TableRemapping of `workspace-id`."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id]
  (t2/exists? :model/TableRemapping
              :database_id  database-id
              :workspace_id (remapping-workspace-id workspace-id)))

(mu/defn table-remappings-of-database
  "The TableRemappings of `workspace-id` of the Database with `database-id`."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id]
  (t2/select :model/TableRemapping
             :database_id  database-id
             :workspace_id (remapping-workspace-id workspace-id)))

(mu/defn table-remapping
  "The TableRemapping of `workspace-id` of the Database with `database-id` whose source is `from-spec`, or nil."
  [database-id  :- ::lib.schema.id/database
   workspace-id :- ::workspace-id
   from-spec    :- ::table-spec]
  (t2/select-one :model/TableRemapping
                 :database_id     database-id
                 :workspace_id    (remapping-workspace-id workspace-id)
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
              :workspace_id    (remapping-workspace-id workspace-id)
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
              :workspace_id (remapping-workspace-id workspace-id)))

(mu/defn delete-workspace-table-remappings!
  "Delete the TableRemappings of the workspace with `workspace-id`. Returns the number of rows deleted."
  [workspace-id :- ms/PositiveInt]
  (t2/delete! :model/TableRemapping :workspace_id workspace-id))

(mu/defn delete-table-remappings-of-databases!
  "Delete the TableRemappings of `workspace-id` of the Databases with `database-ids`, returning the number of rows
  deleted."
  [database-ids :- [:sequential {:min 1} ::lib.schema.id/database]
   workspace-id :- ::workspace-id]
  (app-db/sum-batched app-db/delete-partition-size
                      #(t2/delete! :model/TableRemapping
                                   :database_id  [:in %]
                                   :workspace_id (remapping-workspace-id workspace-id))
                      database-ids))

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
;;; How a workspace's copies differ from the Tables and Fields that every workspace shares. A Table or Field that only
;;; the workspace has is a row it owns (`workspace_id`, which row-level security reads). `workspace_field_copy` and
;;; `workspace_table_copy` hold a shared row the workspace does not see (`active` false), or the types the copy gives a
;;; shared Field (`active` true).

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

(mu/defn table-fields-of-workspace :- [:sequential :map]
  "The Fields of the Table with `table-id` that are shared or that the workspace with `workspace-id` owns, active or
  not, nested or not, hidden from the workspace or not, with the columns a copy compares, and the owner as
  `:owner_workspace_id`: nil for a shared Field."
  [workspace-id :- ms/PositiveInt
   table-id     :- ::lib.schema.id/table]
  (app-db/with-workspace-id :all
    (t2/select [:model/Field :id :name :parent_id :active :base_type :database_type :database_position
                [:workspace_id :owner_workspace_id]]
               {:where [:and
                        [:= :table_id table-id]
                        [:or [:= :workspace_id nil] [:= :workspace_id workspace-id]]]})))

(mu/defn insert-owned-field! :- ::lib.schema.id/field
  "Insert a top-level Field of the Table with `table-id` for the copy column `column`, owned by the workspace the
  current thread works in, and return its id."
  [table-id :- ::lib.schema.id/table
   {column-name :name :keys [base-type database-type database-position]} :- ::copy-column]
  (t2/insert-returning-pk! :model/Field {:table_id          table-id
                                         :name              column-name
                                         :display_name      column-name
                                         :base_type         base-type
                                         :effective_type    base-type
                                         :database_type     (or database-type "NULL")
                                         :database_position database-position
                                         :position          database-position
                                         :active            true}))

(mu/defn update-owned-field!
  "Set the types and position of the copy column `column` on the Field with `field-id`, which the workspace the current
  thread works in owns."
  [field-id :- ::lib.schema.id/field
   {:keys [base-type database-type database-position]} :- ::copy-column]
  (t2/update! :model/Field :id field-id {:base_type         base-type
                                         :effective_type    base-type
                                         :database_type     (or database-type "NULL")
                                         :database_position database-position
                                         :active            true}))

(mu/defn delete-owned-fields!
  "Delete the Fields with `field-ids`, which the workspace with `workspace-id` owns."
  [workspace-id :- ms/PositiveInt
   field-ids    :- [:sequential ::lib.schema.id/field]]
  (when (seq field-ids)
    (app-db/with-workspace-id :all
      (t2/delete! :model/Field :id [:in field-ids] :workspace_id workspace-id))))

(mu/defn field-copies-of-fields :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` of the Fields with `field-ids`."
  [workspace-id :- ms/PositiveInt
   field-ids    :- [:sequential ::lib.schema.id/field]]
  (if (empty? field-ids)
    []
    (t2/select :model/WorkspaceFieldCopy :workspace_id workspace-id :field_id [:in field-ids])))

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

(mu/defn hide-shared-twins! :- :nil
  "Give the workspace with `workspace-id` a hide row for each shared Table or Field that repeats one it owns: production
  synced the same table or column after the workspace's transform made it, and the workspace must see only its own.
  PostgreSQL only, where workspaces own rows."
  [workspace-id :- ms/PositiveInt]
  (app-db/with-workspace-id :all
    (let [table-copy (t2/table-name :model/WorkspaceTableCopy)
          field-copy (t2/table-name :model/WorkspaceFieldCopy)
          table      (t2/table-name :model/Table)
          field      (t2/table-name :model/Field)]
      (t2/query {:insert-into   [[table-copy [:workspace_id :table_id :active :created_at :updated_at]]
                                 ^:allow-subquery {:select [[workspace-id] :shared.id [false] [[:now]] [[:now]]]
                                                   :from   [[table :shared]]
                                                   :join   [[table :owned]
                                                            [:and
                                                             [:= :owned.db_id :shared.db_id]
                                                             [:= :owned.name :shared.name]
                                                             [:= [:coalesce :owned.schema ""] [:coalesce :shared.schema ""]]
                                                             [:= :owned.workspace_id workspace-id]]]
                                                   :where  [:= :shared.workspace_id nil]}]
                 :on-conflict   [:workspace_id :table_id]
                 :do-update-set {:active false :updated_at [:now]}})
      (t2/query {:insert-into   [[field-copy [:workspace_id :field_id :active :created_at :updated_at]]
                                 ^:allow-subquery {:select [[workspace-id] :shared.id [false] [[:now]] [[:now]]]
                                                   :from   [[field :shared]]
                                                   :join   [[field :owned]
                                                            [:and
                                                             [:= :owned.table_id :shared.table_id]
                                                             [:= :owned.name :shared.name]
                                                             [:= [:coalesce :owned.parent_id 0] [:coalesce :shared.parent_id 0]]
                                                             [:= :owned.workspace_id workspace-id]]]
                                                   :where  [:= :shared.workspace_id nil]}]
                 :on-conflict   [:workspace_id :field_id]
                 :do-update-set {:active false :base_type nil :effective_type nil :database_type nil
                                 :database_position nil :updated_at [:now]}})))
  nil)

(mu/defn field-type-copies-of-database :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` that give a Field of the Database with `database-id` the copy's
  types."
  [workspace-id :- ms/PositiveInt
   database-id  :- ::lib.schema.id/database]
  (t2/select :model/WorkspaceFieldCopy
             {:select [:workspace_field_copy.*]
              :from   [:workspace_field_copy]
              :join   [:metabase_field [:= :metabase_field.id :workspace_field_copy.field_id]
                       :metabase_table [:= :metabase_table.id :metabase_field.table_id]]
              :where  [:and
                       [:= :workspace_field_copy.workspace_id workspace-id]
                       [:= :workspace_field_copy.active true]
                       [:= :metabase_table.db_id database-id]]}))

(mu/defn field-type-copies-of-tables :- [:sequential :map]
  "The workspace_field_copy rows of `workspace-id` that give a Field of the Tables with `table-ids` the copy's types."
  [workspace-id :- ms/PositiveInt
   table-ids    :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/WorkspaceFieldCopy
             {:select [:workspace_field_copy.*]
              :from   [:workspace_field_copy]
              :join   [:metabase_field [:= :metabase_field.id :workspace_field_copy.field_id]]
              :where  [:and
                       [:= :workspace_field_copy.workspace_id workspace-id]
                       [:= :workspace_field_copy.active true]
                       [:in :metabase_field.table_id table-ids]]}))

(mu/defn delete-copies-of-database!
  "Delete the copy rows of `workspace-id` of the Tables and Fields of the Database with `database-id`, and the Tables
  and Fields it owns there."
  [workspace-id :- ms/PositiveInt
   database-id  :- ::lib.schema.id/database]
  (app-db/with-workspace-id :all
    (let [table-ids ^:allow-subquery {:select [:id] :from [:metabase_table] :where [:= :db_id database-id]}]
      (t2/delete! :model/WorkspaceFieldCopy
                  :workspace_id workspace-id
                  :field_id     [:in ^:allow-subquery {:select [:id]
                                                       :from   [:metabase_field]
                                                       :where  [:in :table_id table-ids]}])
      (t2/delete! :model/WorkspaceTableCopy
                  :workspace_id workspace-id
                  :table_id     [:in table-ids])
      (t2/delete! :model/Field :workspace_id workspace-id :table_id [:in table-ids])
      (t2/delete! :model/Table :workspace_id workspace-id :db_id database-id))))

;;; ------------------------------------------ Row-level security -------------------------------------------------
;;;
;;; On Postgres, a policy on `metabase_table` and `metabase_field` shows a connection the shared rows and those of its
;;; workspace ([[metabase.app-db.core/with-workspace-id]]). The migration creates the policies; these turn them on.

(def ^:private row-security-tables
  "The app DB tables that hold rows a workspace owns."
  ["metabase_table" "metabase_field"])

(mu/defn row-security-bypassed? :- :boolean
  "Whether the app DB role skips row-level security, as a superuser or a role with BYPASSRLS does. The role is the
  session's login role (`session_authorization`): Metabase sets no other."
  []
  (boolean (:bypassed (t2/query-one {:select [[[:or :rolsuper :rolbypassrls] :bypassed]]
                                     :from   [:pg_roles]
                                     :where  [:= :rolname [:current_setting "session_authorization"]]}))))

(mu/defn row-security-forced? :- :boolean
  "Whether row-level security is on, and forced for the table owner, on every table that holds rows a workspace owns."
  []
  (let [rows (t2/query {:select [[[:and :relrowsecurity :relforcerowsecurity] :forced]]
                        :from   [:pg_class]
                        :where  [:and [:= :relkind "r"] [:in :relname row-security-tables]]})]
    (and (= (count row-security-tables) (count rows))
         (every? :forced rows))))

(mu/defn set-row-security! :- :nil
  "Turn row-level security on, forced for the table owner, or off, on every table that holds rows a workspace owns."
  [on? :- :boolean]
  (doseq [table row-security-tables]
    (t2/query (if on?
                [(format "ALTER TABLE %s ENABLE ROW LEVEL SECURITY" table)]
                [(format "ALTER TABLE %s DISABLE ROW LEVEL SECURITY" table)]))
    (t2/query (if on?
                [(format "ALTER TABLE %s FORCE ROW LEVEL SECURITY" table)]
                [(format "ALTER TABLE %s NO FORCE ROW LEVEL SECURITY" table)])))
  nil)

(mu/defn workspace-owned-rows-exist? :- :boolean
  "Whether a workspace owns a Table or a Field. Reads every workspace."
  []
  (app-db/with-workspace-id :all
    (or (t2/exists? :model/Table {:where [:not= :workspace_id nil]})
        (t2/exists? :model/Field {:where [:not= :workspace_id nil]}))))
