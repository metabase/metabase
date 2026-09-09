(ns metabase-enterprise.audit-app.db
  "Application database queries for the audit-app module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions and connections."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn audit-database
  "The audit Database, or nil."
  []
  (t2/select-one :model/Database :is_audit true))

(mu/defn non-audit-database-named
  "The non-audit Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name :is_audit false))

(mu/defn insert-database!
  "Insert the Database `row` with the fixed `id`."
  [id  :- ::lib.schema.id/database
   row :- ::warehouses.schema/database.update]
  (t2/insert! :model/Database (assoc row :id id)))

(mu/defn insert-returning-database!
  "Insert the Database `row` and return the new instance."
  [row :- ::warehouses.schema/database.update]
  (t2/insert-returning-instance! :model/Database row))

(mu/defn set-database-engine!
  "Set the engine of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database
   engine      :- :string]
  (t2/update! :model/Database database-id {:engine engine}))

(mu/defn delete-database!
  "Delete the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database :id database-id))

(mu/defn delete-audit-databases!
  "Delete every audit Database."
  []
  (t2/delete! :model/Database :is_audit true))

(mu/defn delete-permissions-for-database!
  "Delete the Permissions rows on the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Permissions {:where [:like :object (str "%/db/" database-id "/%")]}))

(mu/defn tables-of-database-named
  "The Tables of the Database with `database-id` named one of `table-names`."
  [database-id :- ::lib.schema.id/database
   table-names :- [:sequential :string]]
  (t2/select :model/Table :db_id database-id :name [:in table-names]))

(mu/defn tables-of-database-in-id-order
  "The `:id`, `:name`, `:schema`, and `:active` of the Tables of the Database with `database-id`, in ID order."
  [database-id :- ::lib.schema.id/database]
  (t2/select [:model/Table :id :name :schema :active] :db_id database-id {:order-by [[:id :asc]]}))

(mu/defn active-public-table-exists?
  "Whether the Database with `database-id` has an active Table in the `public` schema."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id :schema "public" :active true))

(mu/defn table-ids-to-downcase
  "The IDs of the Metabase-managed Tables of the Database with `database-id` that have no lower-cased counterpart
  yet."
  [database-id :- ::lib.schema.id/database]
  (mapv :id
        (t2/query {:select [:table.id]
                   :from   [[(t2/table-name :model/Table) :table]]
                   :where  [:and [:= :table.db_id database-id]
                            ;; Exclude DATABASECHANGELOG, DATABASECHANGELOGLOCK, and QRTZ_* tables, they are not metabase managed
                            [:not= :table.name "DATABASECHANGELOG"]
                            [:not= :table.name "DATABASECHANGELOGLOCK"] ;; new instances do not get this file, but existing instances may have it
                            [:not [:like :table.name "QRTZ_%"]]
                            [:not [:exists ^:allow-subquery {:select [1]
                                                             :from   [[(t2/table-name :model/Table) :self_table]]
                                                             :where  [:and
                                                                      [:= :self_table.db_id :table.db_id]
                                                                      [:or
                                                                       [:= :self_table.schema [:lower :table.schema]]
                                                                       [:and
                                                                        [:= :self_table.schema "public"]
                                                                        [:= :table.schema nil]]]
                                                                      [:= :self_table.name [:lower :table.name]]]}]]]})))

(mu/defn downcase-tables!
  "Move the Tables with `table-ids` to the `public` schema and lower-case their names."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/update! :model/Table :id [:in table-ids] {:schema "public" :name [:lower :name]}))

(mu/defn field-ids-to-downcase
  "The IDs of the Fields of the Metabase-managed Tables of the Database with `database-id` that have no
  lower-cased counterpart yet."
  [database-id :- ::lib.schema.id/database]
  (mapv :id
        (t2/query {:select     [:field.id]
                   :from       [[(t2/table-name :model/Field) :field]]
                   :inner-join [[(t2/table-name :model/Table) :table]
                                [:= :table.id :field.table_id]]
                   :where      [:and [:= :table.db_id database-id]
                                [:not= :table.name "DATABASECHANGELOG"]
                                [:not [:like :table.name "QRTZ_%"]]
                                [:not [:exists ^:allow-subquery {:select     [1]
                                                                 :from       [[(t2/table-name :model/Field) :self_field]]
                                                                 :inner-join [[(t2/table-name :model/Table) :self_table]
                                                                              [:= :self_table.id :self_field.table_id]]
                                                                 :where      [:and
                                                                              [:= :self_table.db_id :table.db_id]
                                                                              [:or
                                                                               [:= :self_table.schema [:lower :table.schema]]
                                                                               [:and
                                                                                [:= :self_table.schema "public"]
                                                                                [:= :table.schema nil]]]
                                                                              [:= :self_field.name [:lower :field.name]]]}]]]})))

(mu/defn downcase-fields!
  "Lower-case the names of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (t2/update! :model/Field :id [:in field-ids] {:name [:lower :name]}))

(mu/defn clear-table-schemas!
  "Clear the schema of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/update! :model/Table {:db_id database-id} {:schema nil}))

(mu/defn upcase-tables!
  "Upper-case the schemas and names of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/update! :model/Table {:db_id database-id} {:schema [:upper :schema] :name [:upper :name]}))

(mu/defn upcase-fields!
  "Upper-case the names of the Fields of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/update! :model/Field
              {:table_id
               [:in
                ^:allow-subquery {:select [:id]
                                  :from   [(t2/table-name :model/Table)]
                                  :where  [:= :db_id database-id]}]}
              {:name [:upper :name]}))

(mu/defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table.update [:active :name :schema :is_defective_duplicate])]
  (t2/update! :model/Table table-id changes))

(mu/defn delete-table!
  "Delete the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/Table table-id))

(mu/defn field-names-of-table
  "The `:id` and `:name` of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name] :table_id table-id))

(mu/defn card-result-metadata-reducible
  "Reducible raw `:id` and `:result_metadata` rows of the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select [(t2/table-name :model/Card) :id :result_metadata] :database_id database-id))

(mu/defn cards-of-table
  "The Cards on the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Card :table_id table-id))

(mu/defn table-ids-referenced-by-cards
  "The distinct `:table_id` rows of the Cards on the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/query {:select-distinct [:table_id]
             :from            [(t2/table-name :model/Card)]
             :where           [:in :table_id table-ids]}))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id :- ::lib.schema.id/card
   changes :- (mut/select-keys ::queries.schema/card.update [:dataset_query :result_metadata])]
  (t2/update! :model/Card card-id changes))

(mu/defn first-superuser
  "The `:id` and `:email` of the oldest superuser, or nil."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(mu/defn collection-by-entity-id
  "The Collection with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Collection :entity_id entity-id))

(mu/defn delete-analytics-collections!
  "Delete the Collections of the analytics namespace."
  []
  (t2/delete! :model/Collection :namespace "analytics"))

(mu/defn delete-pulse-channel-recipients-of-user!
  "Delete the PulseChannelRecipients of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(mu/defn delete-notification-recipients-of-user!
  "Delete the NotificationRecipients of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/delete! :model/NotificationRecipient :user_id user-id))

(mu/defn archive-pulses-of-creator!
  "Archive the unarchived Pulses created by the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/Pulse {:creator_id user-id, :archived false} {:archived true}))

(mu/defn deactivate-notifications-of-creator!
  "Deactivate the active Notifications created by the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/update! :model/Notification {:creator_id user-id :active true} {:active false}))
