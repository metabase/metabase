(ns metabase.warehouses.db
  "Application database queries for the warehouses module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn router-database-id
  "The router Database id of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-one-fn :router_database_id :model/Database :id database-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn database-by-name
  "The Database named `database-name`, or nil."
  [database-name]
  (t2/select-one :model/Database :name database-name))

(defn set-database-details!
  "Set the connection details of the Database with `database-id`."
  [database-id details]
  (t2/update! :model/Database database-id {:details details}))

(defn set-database-provider-name!
  "Set the provider name of the Database with `database-id`."
  [database-id provider-name]
  (t2/update! :model/Database database-id {:provider_name provider-name}))

(defn health-check-candidate-ids
  "The `:id` of the lowest-id non-audit, non-sample, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(defn fields-exist-for-tables?
  "Whether any Field belongs to a Table selected by the Honey SQL `table-ids-query`."
  [table-ids-query]
  (t2/exists? :model/Field :table_id [:in table-ids-query]))

(defn delete-fields-for-tables!
  "Delete the Fields of the Tables selected by the Honey SQL `table-ids-query` that also match `extra-clause`,
  returning the number deleted."
  [table-ids-query extra-clause]
  (t2/query-one {:delete-from (t2/table-name :model/Field)
                 :where       [:and
                               [:in :table_id table-ids-query]
                               extra-clause]}))

(defn delete-cards-for-database-returning-ids-reducible
  "A reducible that deletes the Cards of the Database with `database-id` and yields their `:id`s (Postgres only)."
  [database-id]
  (t2/reducible-query {:delete-from (t2/table-name :model/Card)
                       :where       [:= :database_id database-id]
                       :returning   [:id]}))

(defn card-ids-for-database-reducible
  "A reducible of the `:id`s of the Cards of the Database with `database-id`."
  [database-id]
  (t2/reducible-query {:from   [(t2/table-name :model/Card)]
                       :select [:id]
                       :where  [:= :database_id database-id]}))

(defn delete-cards-for-database!
  "Delete the Cards of the Database with `database-id`."
  [database-id]
  (t2/query {:delete-from (t2/table-name :model/Card)
             :where       [:= :database_id database-id]}))

(defn disable-uploads-for-all-databases!
  "Disable uploads on every Database that has them enabled."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}))

(defn active-tables-for-database
  "The active Tables of the Database with `database-id`, in case-insensitive display name order."
  [database-id]
  (t2/select :model/Table :db_id database-id :active true {:order-by [[:%lower.display_name :asc]]}))

(defn active-tables-for-databases
  "The active Tables of the Databases with `database-ids`, in database then display name order."
  [database-ids]
  (t2/select :model/Table
             :db_id  [:in database-ids]
             :active true
             {:order-by [[:db_id :asc] [:%lower.display_name :asc]]}))

(defn active-table-ids-for-database
  "The ids of the active Tables of the Database with `database-id`, or nil."
  [database-id]
  (t2/select-pks-set :model/Table, :db_id database-id, :active true))

(defn fields-with-semantic-type
  "The Fields of the Tables with `table-ids` whose semantic type matches the Honey SQL `semantic-type-clause`."
  [table-ids semantic-type-clause]
  (t2/select :model/Field, :table_id [:in table-ids], :semantic_type semantic-type-clause))

(defn databases-reducible
  "A reducible of the `model` rows matching the Honey SQL `where` clause."
  [model where]
  (t2/reducible-select model {:where where}))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table, :id table-id))
