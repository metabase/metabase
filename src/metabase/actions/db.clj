(ns metabase.actions.db
  "Application database queries for the actions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn database-for-action
  "The Database of the model Card of the Action with `action-id`, or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one :model/Database {:select [:db.*]
                                  :from   :action
                                  :join   [[:report_card :card] [:= :card.id :action.model_id]
                                           [:metabase_database :db] [:= :db.id :card.database_id]]
                                  :where  [:= :action.id action-id]}))

(mu/defn table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id [:model/Table :db_id] :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn card-query
  "The query of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards
  "The Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn cards-by-id
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn card-type
  "The type of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :type [:model/Card :type :card_schema] :id card-id))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn dashcard-dashboard-id
  "The `:dashboard_id` of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :dashboard_id [:model/DashboardCard :dashboard_id] dashcard-id))

(mu/defn dashcard-action-id
  "The Action id of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :action_id :model/DashboardCard :id dashcard-id))

(mu/defn delete-dashcards-for-action!
  "Delete the DashboardCards of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/DashboardCard :action_id action-id))

(mu/defn insert-action!
  "Insert the Action `row` and return the inserted instance."
  [row :- ::actions.schema/action.for-insert]
  (t2/insert-returning-instance! :model/Action row))

(mu/defn update-action!
  "Apply `changes` to the Action with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/action.for-update]
  (t2/update! :model/Action action-id changes))

(mu/defn insert-query-action!
  "Insert the QueryAction `action`, returning the number inserted."
  [action :- ::actions.schema/query-action.update]
  (t2/insert! :model/QueryAction action))

(mu/defn insert-http-action!
  "Insert the HTTPAction `action`, returning the number inserted."
  [action :- ::actions.schema/httpaction.update]
  (t2/insert! :model/HTTPAction action))

(mu/defn insert-implicit-action!
  "Insert the ImplicitAction `action`, returning the number inserted."
  [action :- ::actions.schema/implicit-action.update]
  (t2/insert! :model/ImplicitAction action))

(mu/defn update-query-action!
  "Apply `changes` to the QueryAction with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/query-action.update]
  (t2/update! :model/QueryAction action-id changes))

(mu/defn update-http-action!
  "Apply `changes` to the HTTPAction with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/httpaction.update]
  (t2/update! :model/HTTPAction action-id changes))

(mu/defn update-implicit-action!
  "Apply `changes` to the ImplicitAction with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/implicit-action.update]
  (t2/update! :model/ImplicitAction action-id changes))

(mu/defn delete-query-action!
  "Delete the QueryAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/QueryAction :action_id action-id))

(mu/defn delete-http-action!
  "Delete the HTTPAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/HTTPAction :action_id action-id))

(mu/defn delete-implicit-action!
  "Delete the ImplicitAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/ImplicitAction :action_id action-id))

(mu/defn query-actions
  "The QueryActions of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/select :model/QueryAction :action_id [:in action-ids]))

(mu/defn query-action
  "The QueryAction of the Action with `action-id`, or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one :model/QueryAction :action_id action-id))

(mu/defn http-actions
  "The HTTPActions of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/select :model/HTTPAction :action_id [:in action-ids]))

(mu/defn implicit-actions
  "The ImplicitActions of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/select :model/ImplicitAction :action_id [:in action-ids]))

(mu/defn actions-with-id
  "The Actions with `action-id` (usually a single Action, since ids are unique)."
  [action-id :- [:maybe ::lib.schema.id/action]]
  (t2/select :model/Action :id action-id))

(mu/defn actions-with-ids
  "The Actions whose `:id` is in `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/select :model/Action :id [:in action-ids]))

(mu/defn unarchived-action-with-id
  "The unarchived Actions with `action-id` (usually a single Action, since ids are unique)."
  [action-id :- [:maybe ::lib.schema.id/action]]
  (t2/select :model/Action :id action-id :archived false))

(mu/defn action-with-entity-id
  "The Actions with `entity-id` (usually a single Action, since entity ids are unique)."
  [entity-id :- :string]
  (t2/select :model/Action :entity_id entity-id))

(mu/defn actions-of-type
  "The Actions of `action-type`."
  [action-type :- :keyword]
  (t2/select :model/Action :type action-type))

(mu/defn unarchived-actions-for-models
  "The unarchived Actions whose `:model_id` is in `model-ids`."
  [model-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/Action :model_id [:in model-ids] :archived false))

(mu/defn unarchived-non-http-actions-for-model
  "The unarchived, non-HTTP Actions of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select :model/Action :model_id model-id :archived false :type [:not= "http"]))

(mu/defn unarchived-non-http-actions-for-models
  "The unarchived, non-HTTP Actions whose `:model_id` is in `model-ids`."
  [model-ids :- [:set ms/PositiveInt]]
  (t2/select :model/Action :model_id [:in model-ids] :archived false :type [:not= "http"]))

(mu/defn fields-for-parameters
  "The id, base type, display name, and description of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select [:model/Field :id :base_type :display_name :description] :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn action-database-settings
  "The id and Database settings of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/query {:select [:action.id :db.settings]
             :from   :action
             :join   [[:report_card :card] [:= :card.id :action.model_id]
                      [:metabase_database :db] [:= :db.id :card.database_id]]
             :where  [:in :action.id action-ids]}))

(mu/defn card-scope-columns
  "The query, Collection id, Database id, and display of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id))

(mu/defn dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(mu/defn destination-database-exists-for-router?
  "Whether the Database with `database-id` has routing destinations."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :router_database_id database-id))

(mu/defn writable-table-exists?
  "Whether the Database with `database-id` has a writable Table."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id :is_writable true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-with-unknown-writability-exists?
  "Whether the Database with `database-id` has a Table whose writability is unknown."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id :is_writable nil {:from [(warehouse-schema-overlay/table-query)]}))
