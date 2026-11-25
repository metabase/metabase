(ns metabase.warehouses.db
  "Application database queries for the warehouses module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn router-database-id
  "The router Database id of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :router_database_id :model/Database :id database-id))

(mu/defn router-database-ids :- [:map-of ::lib.schema.id/database ::lib.schema.id/database]
  "A map from the id of each destination among the Databases with `database-ids` to the id of its router."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched-map #(t2/select-fn->fn :id :router_database_id :model/Database
                                             :id [:in %]
                                             :router_database_id [:not= nil])
                          database-ids))

(mu/defn lock-databases! :- :nil
  "Lock the Database rows with `database-ids` for update until the transaction ends."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/query {:select [:id]
             :from   [(t2/table-name :model/Database)]
             :where  [:in :id [:auto/param database-ids]]
             :for    [:update]})
  nil)

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-settings-by-name :- [:map-of :string [:maybe ::warehouses.schema/database.settings]]
  "The `:settings` of the Databases named one of `database-names`, by name, with no other column read."
  [database-names :- [:sequential :string]]
  (mdb/select-batched-map #(t2/select-fn->fn :name :settings [:model/Database :name :settings] :name [:in [:auto/param %]])
                          (distinct database-names)))

(mu/defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched #(t2/select :model/Database :id [:in %]) database-ids))

(mu/defn databases-by-ids :- [:map-of ::lib.schema.id/database :map]
  "The Databases with `database-ids`, by id."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched-map #(t2/select-fn->fn :id identity :model/Database :id [:in %]) database-ids))

(mu/defn database-by-name
  "The Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name))

(mu/defn databases-with-uploads-enabled
  "The Databases that have uploads enabled."
  []
  (t2/select :model/Database :uploads_enabled true))

(mu/defn insert-databases! :- [:sequential ::warehouses.schema/database]
  "Insert the Database `rows` with one statement per distinct set of columns, so that a column a row leaves out keeps
  its default, and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::warehouses.schema/database.create]]
  (mdb/insert-returning-instances! :model/Database rows))

(mu/defn update-databases!
  "Apply `rows`, each the id of a Database and the columns to change, with one plain update for the rows that get the
  same changes."
  [rows :- [:sequential :map]]
  (mdb/update-grouped! :model/Database rows))

(defn- set-field-values-scan-due!
  "Mark the value-list scan of the Database with `database-id` due now when `due?` and none is due yet, or clear the
  mark, returning the number updated. Goes by the table, not the model: it is sync's own record, so `updated_at` and
  the update event stay for changes to the Database."
  [database-id due?]
  (let [table (t2/table-name :model/Database)]
    ;; the change log skips this column on purpose (see the `change-log/spec` of `:model/Database`)
    #_{:clj-kondo/ignore [:metabase/change-log-raw-write]}
    (if due?
      (t2/update! table :id database-id :field_values_scan_due_at nil {:field_values_scan_due_at :%now})
      (t2/update! table :id database-id {:field_values_scan_due_at nil}))))

(mu/defn mark-field-values-scan-due!
  "Set `field_values_scan_due_at` of the Database with `database-id` to now, unless a scan is already due, returning
  the number updated."
  [database-id :- ::lib.schema.id/database]
  (set-field-values-scan-due! database-id true))

(mu/defn clear-field-values-scan-due!
  "Clear `field_values_scan_due_at` of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database]
  (set-field-values-scan-due! database-id false))

(mu/defn health-check-candidate-ids
  "The `:id` of the lowest-id non-audit, non-sample, non-stub, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :is_stub false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(mu/defn disable-uploads-for-databases!
  "Disable uploads on the Databases with `database-ids`, returning the number updated."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Database :id [:in %]
                                                          {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}) database-ids))

(mu/defn active-tables-for-database
  "The active Tables of the Database with `database-id`, in case-insensitive display name order."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true {:order-by [[:%lower.display_name :asc]]}))

(mu/defn active-tables-for-databases
  "The active Tables of the Databases with `database-ids`, in database then display name order."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched #(t2/select :model/Table
                                  :db_id  [:in %]
                                  :active true
                                  {:order-by [[:db_id :asc] [:%lower.display_name :asc]]})
                      (sort (distinct database-ids))))

(mu/defn active-table-ids-for-database
  "The ids of the active Tables of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Table, :db_id database-id, :active true))

(mu/defn pk-fields-for-tables
  "The primary-key Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (mdb/select-batched #(t2/select :model/Field :table_id [:in %] :semantic_type (mdb/isa :type/PK)) table-ids))
