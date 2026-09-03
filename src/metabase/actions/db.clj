(ns metabase.actions.db
  "Application database queries for the actions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn database-for-action
  "The Database of the model Card of the Action with `action-id`, or nil."
  [action-id]
  (t2/select-one :model/Database {:select [:db.*]
                                  :from   :action
                                  :join   [[:report_card :card] [:= :card.id :action.model_id]
                                           [:metabase_database :db] [:= :db.id :card.database_id]]
                                  :where  [:= :action.id action-id]}))

(defn table-database-id-row
  "The `:db_id` of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one [:model/Table :db_id] table-id))

(defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id [:model/Table :db_id] table-id))

(defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn cards
  "The Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids]))

(defn cards-by-id
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(defn card-type
  "The type of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one-fn :type [:model/Card :type :card_schema] :id card-id))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id dashboard-id]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(defn dashcard-dashboard-id-row
  "The `:dashboard_id` of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one [:model/DashboardCard :dashboard_id] dashcard-id))

(defn dashcard-action-id
  "The Action id of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id]
  (t2/select-one-fn :action_id :model/DashboardCard :id dashcard-id))

(defn delete-dashcards-for-action!
  "Delete the DashboardCards of the Action with `action-id`."
  [action-id]
  (t2/delete! :model/DashboardCard :action_id action-id))

(defn insert-action!
  "Insert the Action `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/Action row))

(defn update-action!
  "Apply `changes` to the Action with `action-id`."
  [action-id changes]
  (t2/update! :model/Action action-id changes))

(defn insert-action-type-row!
  "Insert the `model` (action type table) `row`."
  [model row]
  (t2/insert! model row))

(defn update-action-type-row!
  "Apply `changes` to the `model` (action type table) row with `id`."
  [model id changes]
  (t2/update! model id changes))

(defn delete-action-type-rows!
  "Delete the `model` (action type table) rows of the Action with `action-id`."
  [model action-id]
  (t2/delete! model :action_id action-id))

(defn query-actions
  "The QueryActions of the Actions with `action-ids`."
  [action-ids]
  (t2/select :model/QueryAction :action_id [:in action-ids]))

(defn query-action
  "The QueryAction of the Action with `action-id`, or nil."
  [action-id]
  (t2/select-one :model/QueryAction :action_id action-id))

(defn http-actions
  "The HTTPActions of the Actions with `action-ids`."
  [action-ids]
  (t2/select :model/HTTPAction :action_id [:in action-ids]))

(defn implicit-actions
  "The ImplicitActions of the Actions with `action-ids`."
  [action-ids]
  (t2/select :model/ImplicitAction :action_id [:in action-ids]))

(defn actions
  "The Actions selected by the Toucan 2 `options`."
  [& options]
  (apply t2/select :model/Action options))

(defn fields-for-parameters
  "The id, base type, display name, and description of the Fields with `field-ids`."
  [field-ids]
  (t2/select [:model/Field :id :base_type :display_name :description] :id [:in field-ids]))

(defn action-database-settings
  "The id and Database settings of the Actions with `action-ids`."
  [action-ids]
  (t2/query {:select [:action.id :db.settings]
             :from   :action
             :join   [[:report_card :card] [:= :card.id :action.model_id]
                      [:metabase_database :db] [:= :db.id :card.database_id]]
             :where  [:in :action.id action-ids]}))

(defn card-scope-columns
  "The query, Collection id, Database id, and display of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id))

(defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(defn destination-database-exists-for-router?
  "Whether the Database with `database-id` has routing destinations."
  [database-id]
  (t2/exists? :model/Database :router_database_id database-id))

(defn writable-table-exists?
  "Whether the Database with `database-id` has a writable Table."
  [database-id]
  (t2/exists? :model/Table :db_id database-id :is_writable true))

(defn table-with-unknown-writability-exists?
  "Whether the Database with `database-id` has a Table whose writability is unknown."
  [database-id]
  (t2/exists? :model/Table :db_id database-id :is_writable nil))
