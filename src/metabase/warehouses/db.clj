(ns metabase.warehouses.db
  "Application database queries for the warehouses module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn router-database-id :- [:maybe ::lib.schema.id/database]
  "The router Database id of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :router_database_id :model/Database :id database-id))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn non-destination-database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(mu/defn databases :- [:sequential ::warehouses.schema/database]
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-by-name :- [:maybe ::warehouses.schema/database]
  "The Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name))

(mu/defn set-database-details! :- :int
  "Set the connection details of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   details     :- :map]
  (t2/update! :model/Database database-id {:details details}))

(mu/defn set-database-provider-name! :- :int
  "Set the provider name of the Database with `database-id`, returning the number updated."
  [database-id    :- ::lib.schema.id/database
   provider-name  :- :string]
  (t2/update! :model/Database database-id {:provider_name provider-name}))

(mu/defn health-check-candidate-ids :- [:sequential [:map {:closed true} [:id ms/PositiveInt]]]
  "The `:id` of the lowest-id non-audit, non-sample, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(defn- table-ids-of-database-query
  [database-id]
  ^:allow-subquery {:from [(t2/table-name :model/Table)], :select [:id], :where [:= :db_id database-id]})

(mu/defn fields-exist-for-database? :- :boolean
  "Whether any Field belongs to a Table of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Field :table_id [:in (table-ids-of-database-query database-id)]))

(mu/defn delete-childless-fields-for-database! :- :int
  "Delete the childless Fields of the Tables of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (let [table-ids-query (table-ids-of-database-query database-id)
        extra-clause    (if (= (mdb/db-type) :mysql)
                          ;; double-wrapped subquery to work around the MySQL restriction on selecting from the
                          ;; DELETE target
                          [:not-in :id ^:allow-subquery {:select [:parent_id]
                                                         :from   [[^:allow-subquery {:select [:parent_id]
                                                                                     :from   [(t2/table-name :model/Field)]
                                                                                     :where  [:and
                                                                                              [:not= :parent_id nil]
                                                                                              [:in :table_id table-ids-query]]}
                                                                   :parent_fields]]}]
                          [:not [:exists ^:allow-subquery {:select [1]
                                                           :from   [[(t2/table-name :model/Field) :child_field]]
                                                           :where  [:= :child_field.parent_id :metabase_field.id]}]])]
    (t2/query-one {:delete-from (t2/table-name :model/Field)
                   :where       [:and
                                 [:in :table_id table-ids-query]
                                 extra-clause]})))

(mu/defn delete-cards-for-database-returning-ids-reducible
  "A reducible that deletes the Cards of the Database with `database-id` and yields their `:id`s (Postgres only)."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:delete-from (t2/table-name :model/Card)
                       :where       [:= :database_id database-id]
                       :returning   [:id]}))

(mu/defn card-ids-for-database-reducible
  "A reducible of the `:id`s of the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:from   [(t2/table-name :model/Card)]
                       :select [:id]
                       :where  [:= :database_id database-id]}))

(mu/defn delete-cards-for-database! :- [:sequential :int]
  "Delete the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:delete-from (t2/table-name :model/Card)
             :where       [:= :database_id database-id]}))

(mu/defn disable-uploads-for-all-databases! :- :int
  "Disable uploads on every Database that has them enabled, returning the number updated."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}))

(mu/defn active-tables-for-database :- [:sequential ::warehouse-schema.schema/table]
  "The active Tables of the Database with `database-id`, in case-insensitive display name order."
  [database-id :- ::lib.schema.id/database]
  (t2/select :model/Table :db_id database-id :active true {:order-by [[:%lower.display_name :asc]]}))

(mu/defn active-tables-for-databases :- [:sequential ::warehouse-schema.schema/table]
  "The active Tables of the Databases with `database-ids`, in database then display name order."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Table
             :db_id  [:in database-ids]
             :active true
             {:order-by [[:db_id :asc] [:%lower.display_name :asc]]}))

(mu/defn active-table-ids-for-database :- [:maybe [:set ::lib.schema.id/table]]
  "The ids of the active Tables of the Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-pks-set :model/Table, :db_id database-id, :active true))

(mu/defn pk-fields-for-tables :- [:sequential ::warehouse-schema.schema/field]
  "The primary-key Fields of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field, :table_id [:in table-ids], :semantic_type (mdb/isa :type/PK)))

(mu/defn databases-reducible
  "A reducible of the Databases matching the Honey SQL `where` clause."
  [where :- [:maybe vector?]]
  (t2/reducible-select :model/Database {:where where}))

(mu/defn table-database-id :- [:maybe ::lib.schema.id/database]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table, :id table-id))
