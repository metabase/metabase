(ns metabase-enterprise.audit-app.db
  "Application database queries for the audit-app module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions and connections."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private DatabaseRow
  "A whole-entity row for `:model/Database`, e.g. for `t2/insert!`/`t2/insert-returning-instance!`."
  [:map {:closed true}
   [:id                          {:optional true} :any]
   [:created_at                  {:optional true} :any]
   [:updated_at                  {:optional true} :any]
   [:name                        {:optional true} :any]
   [:description                 {:optional true} :any]
   [:details                     {:optional true} :any]
   [:engine                      {:optional true} :any]
   [:is_sample                   {:optional true} :any]
   [:is_full_sync                {:optional true} :any]
   [:points_of_interest          {:optional true} :any]
   [:caveats                     {:optional true} :any]
   [:metadata_sync_schedule      {:optional true} :any]
   [:cache_field_values_schedule {:optional true} :any]
   [:timezone                    {:optional true} :any]
   [:is_on_demand                {:optional true} :any]
   [:auto_run_queries            {:optional true} :any]
   [:refingerprint               {:optional true} :any]
   [:cache_ttl                   {:optional true} :any]
   [:initial_sync_status         {:optional true} :any]
   [:creator_id                  {:optional true} :any]
   [:settings                    {:optional true} :any]
   [:dbms_version                {:optional true} :any]
   [:is_audit                    {:optional true} :any]
   [:uploads_enabled             {:optional true} :any]
   [:uploads_schema_name         {:optional true} :any]
   [:uploads_table_prefix        {:optional true} :any]
   [:is_attached_dwh             {:optional true} :any]
   [:router_database_id          {:optional true} :any]
   [:provider_name               {:optional true} :any]
   [:write_data_details          {:optional true} :any]
   [:admin_details               {:optional true} :any]
   [:is_stub                     {:optional true} :any]])

(mu/defn audit-database :- [:maybe (ms/InstanceOf :model/Database)]
  "The audit Database, or nil."
  []
  (t2/select-one :model/Database :is_audit true))

(mu/defn non-audit-database-named :- [:maybe (ms/InstanceOf :model/Database)]
  "The non-audit Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name :is_audit false))

(mu/defn insert-database! :- :int
  "Insert the Database `row`."
  [row :- DatabaseRow]
  (t2/insert! :model/Database row))

(mu/defn insert-returning-database! :- (ms/InstanceOf :model/Database)
  "Insert the Database `row` and return the new instance."
  [row :- DatabaseRow]
  (t2/insert-returning-instance! :model/Database row))

(mu/defn set-database-engine! :- :int
  "Set the engine of the Database with `database-id`."
  [database-id :- ms/PositiveInt
   engine      :- :string]
  (t2/update! :model/Database database-id {:engine engine}))

(mu/defn delete-database! :- :int
  "Delete the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/delete! :model/Database :id database-id))

(mu/defn delete-audit-databases! :- :int
  "Delete every audit Database."
  []
  (t2/delete! :model/Database :is_audit true))

(mu/defn delete-permissions-for-database! :- :int
  "Delete the Permissions rows on the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/delete! :model/Permissions {:where [:like :object (str "%/db/" database-id "/%")]}))

(mu/defn tables-of-database-named :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables of the Database with `database-id` named one of `table-names`."
  [database-id :- ms/PositiveInt
   table-names :- [:seqable :string]]
  (t2/select :model/Table :db_id database-id :name [:in table-names]))

(mu/defn tables-of-database-in-id-order :- [:sequential (ms/InstanceOf :model/Table)]
  "The `:id`, `:name`, `:schema`, and `:active` of the Tables of the Database with `database-id`, in ID order."
  [database-id :- ms/PositiveInt]
  (t2/select [:model/Table :id :name :schema :active] :db_id database-id {:order-by [[:id :asc]]}))

(mu/defn active-public-table-exists? :- :boolean
  "Whether the Database with `database-id` has an active Table in the `public` schema."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Table :db_id database-id :schema "public" :active true))

(mu/defn table-ids-to-downcase :- [:sequential ms/PositiveInt]
  "The IDs of the Metabase-managed Tables of the Database with `database-id` that have no lower-cased counterpart
  yet."
  [database-id :- ms/PositiveInt]
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

(mu/defn downcase-tables! :- :int
  "Move the Tables with `table-ids` to the `public` schema and lower-case their names."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/update! :model/Table :id [:in table-ids] {:schema "public" :name [:lower :name]}))

(mu/defn field-ids-to-downcase :- [:sequential ms/PositiveInt]
  "The IDs of the Fields of the Metabase-managed Tables of the Database with `database-id` that have no
  lower-cased counterpart yet."
  [database-id :- ms/PositiveInt]
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

(mu/defn downcase-fields! :- :int
  "Lower-case the names of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/update! :model/Field :id [:in field-ids] {:name [:lower :name]}))

(mu/defn clear-table-schemas! :- :int
  "Clear the schema of the Tables of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/update! :model/Table {:db_id database-id} {:schema nil}))

(mu/defn upcase-tables! :- :int
  "Upper-case the schemas and names of the Tables of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/update! :model/Table {:db_id database-id} {:schema [:upper :schema] :name [:upper :name]}))

(mu/defn upcase-fields! :- :int
  "Upper-case the names of the Fields of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/update! :model/Field
              {:table_id
               [:in
                ^:allow-subquery {:select [:id]
                                  :from   [(t2/table-name :model/Table)]
                                  :where  [:= :db_id database-id]}]}
              {:name [:upper :name]}))

(mu/defn update-table! :- :int
  "Apply `changes` to the Table with `table-id`."
  [table-id :- ms/PositiveInt
   changes  :- [:map {:closed true}
                [:active                  {:optional true} :any]
                [:name                    {:optional true} :any]
                [:schema                  {:optional true} :any]
                [:is_defective_duplicate  {:optional true} :any]]]
  (t2/update! :model/Table table-id changes))

(mu/defn delete-table! :- :int
  "Delete the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/delete! :model/Table table-id))

(mu/defn field-names-of-table :- [:sequential (ms/InstanceOf :model/Field)]
  "The `:id` and `:name` of the Fields of the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select [:model/Field :id :name] :table_id table-id))

(mu/defn card-result-metadata-reducible
  "Reducible raw `:id` and `:result_metadata` rows of the Cards of the Database with `database-id`."
  [database-id :- ms/PositiveInt]
  (t2/reducible-select [(t2/table-name :model/Card) :id :result_metadata] :database_id database-id))

(mu/defn cards-of-table :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards on the Table with `table-id`."
  [table-id :- ms/PositiveInt]
  (t2/select :model/Card :table_id table-id))

(mu/defn table-ids-referenced-by-cards :- [:sequential [:map {:closed true} [:table_id [:maybe ms/PositiveInt]]]]
  "The distinct `:table_id` rows of the Cards on the Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/query {:select-distinct [:table_id]
             :from            [(t2/table-name :model/Card)]
             :where           [:in :table_id table-ids]}))

(mu/defn update-card! :- :int
  "Apply `changes` to the Card with `card-id`."
  [card-id :- ms/PositiveInt
   changes :- [:map {:closed true}
               [:dataset_query    :any]
               [:result_metadata  {:optional true} :any]]]
  (t2/update! :model/Card card-id changes))

(mu/defn first-superuser :- [:maybe (ms/InstanceOf :model/User)]
  "The `:id` and `:email` of the oldest superuser, or nil."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(mu/defn collection-by-entity-id :- [:maybe (ms/InstanceOf :model/Collection)]
  "The Collection with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Collection :entity_id entity-id))

(mu/defn delete-analytics-collections! :- :int
  "Delete the Collections of the analytics namespace."
  []
  (t2/delete! :model/Collection :namespace "analytics"))

(mu/defn delete-pulse-channel-recipients-of-user! :- :int
  "Delete the PulseChannelRecipients of the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(mu/defn delete-notification-recipients-of-user! :- :int
  "Delete the NotificationRecipients of the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/delete! :model/NotificationRecipient :user_id user-id))

(mu/defn archive-pulses-of-creator! :- :int
  "Archive the unarchived Pulses created by the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/update! :model/Pulse {:creator_id user-id, :archived false} {:archived true}))

(mu/defn deactivate-notifications-of-creator! :- :int
  "Deactivate the active Notifications created by the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/update! :model/Notification {:creator_id user-id :active true} {:active false}))
