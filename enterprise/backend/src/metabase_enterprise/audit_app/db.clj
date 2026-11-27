(ns metabase-enterprise.audit-app.db
  "Application database queries for the audit-app module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions and connections."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.notification.models :as models.notification]
   [metabase.pulse.models.pulse :as pulse]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn audit-database
  "The audit Database, or nil."
  []
  (t2/select-one :model/Database :is_audit true))

(mu/defn non-audit-database-named
  "The non-audit Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name :is_audit false))

(mu/defn audit-database-ids :- [:sequential ::lib.schema.id/database]
  "The ids of the audit Databases."
  []
  (vec (t2/select-pks-vec :model/Database :is_audit true)))

(mu/defn tables-of-database-named
  "The Tables of the Database with `database-id` named one of `table-names`."
  [database-id :- ::lib.schema.id/database
   table-names :- [:or [:set :string] [:sequential :string]]]
  (mdb/select-batched #(t2/select :model/Table :db_id database-id :name [:in %]) table-names))

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
                   :from      [[(t2/table-name :model/Table) :table]]
                   :where  [:and [:= :table.db_id database-id]
                            ;; Exclude DATABASECHANGELOG, DATABASECHANGELOGLOCK, and QRTZ_* tables, they are not metabase managed
                            [:not= :table.name "DATABASECHANGELOG"]
                            [:not= :table.name "DATABASECHANGELOGLOCK"] ;; new instances do not get this file, but existing instances may have it
                            [:not= :table.name "DATABASECHANGELOG_VERSION"]
                            [:not= :table.name "DATABASECHANGELOG_FIRST_RUN"]
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

(mu/defn field-ids-to-downcase
  "The IDs of the Fields of the Metabase-managed Tables of the Database with `database-id` that have no
  lower-cased counterpart yet."
  [database-id :- ::lib.schema.id/database]
  (mapv :id
        (t2/query {:select     [:field.id]
                   :from      [[(t2/table-name :model/Field) :field]]
                   :inner-join [[(t2/table-name :model/Table) :table]
                                [:= :table.id :field.table_id]]
                   :where      [:and [:= :table.db_id database-id]
                                [:not= :table.name "DATABASECHANGELOG"]
                                [:not= :table.name "DATABASECHANGELOG_VERSION"]
                                [:not= :table.name "DATABASECHANGELOG_FIRST_RUN"]
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

(mu/defn field-names-of-table
  "The `:id` and `:name` of the Fields of the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select [:model/Field :id :name] :table_id table-id))

(mu/defn field-names-of-database :- [:set :string]
  "The distinct names of the Fields of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-fn-set :name [:model/Field :name] :table_id [:in ^:allow-subquery {:select [:id]
                                                                                :from   [(t2/table-name :model/Table)]
                                                                                :where  [:= :db_id database-id]}]))

(mu/defn card-result-metadata-reducible
  "Reducible raw `:id`, `:dataset_query` and `:result_metadata` rows of the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-select [(t2/table-name :model/Card) :id :dataset_query :result_metadata] :database_id database-id))

(mu/defn cards-of-table
  "The Cards on the Table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select :model/Card :table_id table-id))

(mu/defn table-ids-referenced-by-cards
  "The distinct `:table_id` rows of the Cards on the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (mdb/select-batched #(t2/query {:select-distinct [:table_id]
                                  :from            [(t2/table-name :model/Card)]
                                  :where           [:in :table_id %]})
                      table-ids))

(mu/defn first-superuser
  "The `:id` and `:email` of the oldest superuser, or nil."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(mu/defn collection-by-entity-id
  "The Collection with `entity-id`, or nil."
  [entity-id :- :string]
  (t2/select-one :model/Collection :entity_id entity-id))

(mu/defn analytics-collection-ids
  "The IDs of the Collections of the analytics namespace."
  []
  (vec (t2/select-pks-set :model/Collection :namespace "analytics")))

(mu/defn delete-pulse-channel-recipients-of-user!
  "Delete the PulseChannelRecipients of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (pulse/delete-pulse-channel-recipients-for-users! [user-id]))

(mu/defn delete-notification-recipients-of-user!
  "Delete the NotificationRecipients of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (models.notification/delete-notification-recipients-for-users! [user-id]))

(mu/defn archive-pulses-of-creator!
  "Archive the unarchived Pulses created by the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (pulse/update-pulses! (mapv #(hash-map :id % :archived true) (t2/select-pks-vec :model/Pulse :creator_id user-id :archived false))))

(mu/defn deactivate-notifications-of-creator!
  "Deactivate the active Notifications created by the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (models.notification/update-notifications! (mapv #(hash-map :id % :active false)
                                                   (t2/select-pks-vec :model/Notification :creator_id user-id :active true))))
