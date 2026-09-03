(ns metabase-enterprise.audit-app.db
  "Application database queries for the audit-app module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for transactions and connections."
  (:require
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Databases ----------------------------------------------------

(defn audit-database
  "The audit Database, or nil."
  []
  (t2/select-one :model/Database :is_audit true))

(defn non-audit-database-named
  "The non-audit Database named `database-name`, or nil."
  [database-name]
  (t2/select-one :model/Database :name database-name :is_audit false))

(defn insert-database!
  "Insert the Database `row`."
  [row]
  (t2/insert! :model/Database row))

(defn insert-returning-database!
  "Insert the Database `row` and return the new instance."
  [row]
  (t2/insert-returning-instance! :model/Database row))

(defn set-database-engine!
  "Set the engine of the Database with `database-id`."
  [database-id engine]
  (t2/update! :model/Database database-id {:engine engine}))

(defn delete-database!
  "Delete the Database with `database-id`."
  [database-id]
  (t2/delete! :model/Database :id database-id))

(defn delete-audit-databases!
  "Delete every audit Database."
  []
  (t2/delete! :model/Database :is_audit true))

(defn delete-permissions-for-database!
  "Delete the Permissions rows on the Database with `database-id`."
  [database-id]
  (t2/delete! :model/Permissions {:where [:like :object (str "%/db/" database-id "/%")]}))

;;; ------------------------------------------------ Tables and Fields ------------------------------------------------

(defn tables-of-database-named
  "The Tables of the Database with `database-id` named one of `table-names`."
  [database-id table-names]
  (t2/select :model/Table :db_id database-id :name [:in table-names]))

(defn tables-of-database-in-id-order
  "The `:id`, `:name`, `:schema`, and `:active` of the Tables of the Database with `database-id`, in ID order."
  [database-id]
  (t2/select [:model/Table :id :name :schema :active] :db_id database-id {:order-by [[:id :asc]]}))

(defn active-public-table-exists?
  "Whether the Database with `database-id` has an active Table in the `public` schema."
  [database-id]
  (t2/exists? :model/Table :db_id database-id :schema "public" :active true))

(defn table-ids-to-downcase
  "The `:id` rows of the Metabase-managed Tables of the Database with `database-id` that have no lower-cased
  counterpart yet."
  [database-id]
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
                                                                [:= :self_table.name [:lower :table.name]]]}]]]}))

(defn downcase-tables!
  "Move the Tables with `table-ids` to the `public` schema and lower-case their names."
  [table-ids]
  (t2/update! :model/Table :id [:in table-ids] {:schema "public" :name [:lower :name]}))

(defn field-ids-to-downcase
  "The `:id` rows of the Fields of the Metabase-managed Tables of the Database with `database-id` that have no
  lower-cased counterpart yet."
  [database-id]
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
                                                                        [:= :self_field.name [:lower :field.name]]]}]]]}))

(defn downcase-fields!
  "Lower-case the names of the Fields with `field-ids`."
  [field-ids]
  (t2/update! :model/Field :id [:in field-ids] {:name [:lower :name]}))

(defn clear-table-schemas!
  "Clear the schema of the Tables of the Database with `database-id`."
  [database-id]
  (t2/update! :model/Table {:db_id database-id} {:schema nil}))

(defn upcase-tables!
  "Upper-case the schemas and names of the Tables of the Database with `database-id`."
  [database-id]
  (t2/update! :model/Table {:db_id database-id} {:schema [:upper :schema] :name [:upper :name]}))

(defn upcase-fields!
  "Upper-case the names of the Fields of the Database with `database-id`."
  [database-id]
  (t2/update! :model/Field
              {:table_id
               [:in
                ^:allow-subquery {:select [:id]
                                  :from   [(t2/table-name :model/Table)]
                                  :where  [:= :db_id database-id]}]}
              {:name [:upper :name]}))

(defn update-table!
  "Apply `changes` to the Table with `table-id`."
  [table-id changes]
  (t2/update! :model/Table table-id changes))

(defn delete-table!
  "Delete the Table with `table-id`."
  [table-id]
  (t2/delete! :model/Table table-id))

(defn field-names-of-table
  "The `:id` and `:name` of the Fields of the Table with `table-id`."
  [table-id]
  (t2/select [:model/Field :id :name] :table_id table-id))

;;; ------------------------------------------------------ Cards ------------------------------------------------------

(defn card-result-metadata-reducible
  "Reducible raw `:id` and `:result_metadata` rows of the Cards of the Database with `database-id`."
  [database-id]
  (t2/reducible-select [(t2/table-name :model/Card) :id :result_metadata] :database_id database-id))

(defn cards-of-table
  "The Cards on the Table with `table-id`."
  [table-id]
  (t2/select :model/Card :table_id table-id))

(defn table-ids-referenced-by-cards
  "The distinct `:table_id` rows of the Cards on the Tables with `table-ids`."
  [table-ids]
  (t2/query {:select-distinct [:table_id]
             :from            [(t2/table-name :model/Card)]
             :where           [:in :table_id table-ids]}))

(defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id changes]
  (t2/update! :model/Card card-id changes))

;;; --------------------------------------------------- Other models ---------------------------------------------------

(defn first-superuser
  "The `:id` and `:email` of the oldest superuser, or nil."
  []
  (t2/select-one [:model/User :id :email] :is_superuser true {:order-by [[:id :asc]]}))

(defn collection-by-entity-id
  "The Collection with `entity-id`, or nil."
  [entity-id]
  (t2/select-one :model/Collection :entity_id entity-id))

(defn delete-analytics-collections!
  "Delete the Collections of the analytics namespace."
  []
  (t2/delete! :model/Collection :namespace "analytics"))

(defn delete-pulse-channel-recipients-of-user!
  "Delete the PulseChannelRecipients of the User with `user-id`."
  [user-id]
  (t2/delete! :model/PulseChannelRecipient :user_id user-id))

(defn delete-notification-recipients-of-user!
  "Delete the NotificationRecipients of the User with `user-id`."
  [user-id]
  (t2/delete! :model/NotificationRecipient :user_id user-id))

(defn archive-pulses-of-creator!
  "Archive the unarchived Pulses created by the User with `user-id`."
  [user-id]
  (t2/update! :model/Pulse {:creator_id user-id, :archived false} {:archived true}))

(defn deactivate-notifications-of-creator!
  "Deactivate the active Notifications created by the User with `user-id`."
  [user-id]
  (t2/update! :model/Notification {:creator_id user-id :active true} {:active false}))
