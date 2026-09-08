(ns metabase.actions.db
  "Application database queries for the actions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private ActionRow
  "The columns common to all Action types (see `metabase.actions.models/action-columns`)."
  [:map {:closed true}
   [:archived                {:optional true} :any]
   [:created_at              {:optional true} :any]
   [:creator_id              {:optional true} :any]
   [:description             {:optional true} :any]
   [:entity_id               {:optional true} :any]
   [:made_public_by_id       {:optional true} :any]
   [:model_id                {:optional true} :any]
   [:name                    {:optional true} :any]
   [:parameter_mappings      {:optional true} :any]
   [:parameters              {:optional true} :any]
   [:public_uuid             {:optional true} :any]
   [:public_uuid_prefix      {:optional true} :any]
   [:type                    {:optional true} :any]
   [:updated_at              {:optional true} :any]
   [:visualization_settings  {:optional true} :any]])

(def ^:private QueryActionRow
  [:map {:closed true}
   [:action_id     {:optional true} :any]
   [:database_id   {:optional true} :any]
   [:dataset_query {:optional true} :any]
   [:legacy_query  {:optional true} :any]])

(def ^:private HTTPActionRow
  [:map {:closed true}
   [:action_id        {:optional true} :any]
   [:template         {:optional true} :any]
   [:response_handle   {:optional true} :any]
   [:error_handle      {:optional true} :any]])

(def ^:private ImplicitActionRow
  [:map {:closed true}
   [:action_id {:optional true} :any]
   [:kind      {:optional true} :any]])

(mu/defn database-for-action :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database of the model Card of the Action with `action-id`, or nil."
  [action-id :- ms/PositiveInt]
  (t2/select-one :model/Database {:select [:db.*]
                                  :from   :action
                                  :join   [[:report_card :card] [:= :card.id :action.model_id]
                                           [:metabase_database :db] [:= :db.id :card.database_id]]
                                  :where  [:= :action.id action-id]}))

(mu/defn table-database-id :- [:maybe ms/PositiveInt]
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one-fn :db_id [:model/Table :db_id] table-id))

(mu/defn card-query :- [:maybe :map]
  "The query of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(mu/defn card :- [:maybe (ms/InstanceOf :model/Card)]
  "The Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards :- [:sequential (ms/InstanceOf :model/Card)]
  "The Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn cards-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Card)]
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn card-type :- [:maybe :keyword]
  "The type of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :type [:model/Card :type :card_schema] :id card-id))

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables :- [:sequential (ms/InstanceOf :model/Table)]
  "The Tables with `table-ids`."
  [table-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn database :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database with `database-id`, or nil."
  [database-id :- ms/PositiveInt]
  (t2/select-one :model/Database :id database-id))

(mu/defn dashcard-in-dashboard :- [:maybe (ms/InstanceOf :model/DashboardCard)]
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ms/PositiveInt
   dashboard-id :- ms/PositiveInt]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn dashcard-dashboard-id :- [:maybe ms/PositiveInt]
  "The `:dashboard_id` of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one-fn :dashboard_id [:model/DashboardCard :dashboard_id] dashcard-id))

(mu/defn dashcard-action-id :- [:maybe ms/PositiveInt]
  "The Action id of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ms/PositiveInt]
  (t2/select-one-fn :action_id :model/DashboardCard :id dashcard-id))

(mu/defn delete-dashcards-for-action! :- :int
  "Delete the DashboardCards of the Action with `action-id`, returning the number deleted."
  [action-id :- ms/PositiveInt]
  (t2/delete! :model/DashboardCard :action_id action-id))

(mu/defn insert-action! :- (ms/InstanceOf :model/Action)
  "Insert the Action `row` and return the inserted instance."
  [row :- ActionRow]
  (t2/insert-returning-instance! :model/Action row))

(mu/defn update-action! :- :int
  "Apply `changes` to the Action with `action-id`, returning the number updated."
  [action-id :- ms/PositiveInt
   changes   :- ActionRow]
  (t2/update! :model/Action action-id changes))

(mu/defn insert-query-action! :- :int
  "Insert the QueryAction `action`, returning the number inserted."
  [action :- QueryActionRow]
  (t2/insert! :model/QueryAction action))

(mu/defn insert-http-action! :- :int
  "Insert the HTTPAction `action`, returning the number inserted."
  [action :- HTTPActionRow]
  (t2/insert! :model/HTTPAction action))

(mu/defn insert-implicit-action! :- :int
  "Insert the ImplicitAction `action`, returning the number inserted."
  [action :- ImplicitActionRow]
  (t2/insert! :model/ImplicitAction action))

(mu/defn update-query-action! :- :int
  "Apply `changes` to the QueryAction with `action-id`, returning the number updated."
  [action-id :- ms/PositiveInt
   changes   :- QueryActionRow]
  (t2/update! :model/QueryAction action-id changes))

(mu/defn update-http-action! :- :int
  "Apply `changes` to the HTTPAction with `action-id`, returning the number updated."
  [action-id :- ms/PositiveInt
   changes   :- HTTPActionRow]
  (t2/update! :model/HTTPAction action-id changes))

(mu/defn update-implicit-action! :- :int
  "Apply `changes` to the ImplicitAction with `action-id`, returning the number updated."
  [action-id :- ms/PositiveInt
   changes   :- ImplicitActionRow]
  (t2/update! :model/ImplicitAction action-id changes))

(mu/defn delete-query-action! :- :int
  "Delete the QueryAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ms/PositiveInt]
  (t2/delete! :model/QueryAction :action_id action-id))

(mu/defn delete-http-action! :- :int
  "Delete the HTTPAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ms/PositiveInt]
  (t2/delete! :model/HTTPAction :action_id action-id))

(mu/defn delete-implicit-action! :- :int
  "Delete the ImplicitAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ms/PositiveInt]
  (t2/delete! :model/ImplicitAction :action_id action-id))

(mu/defn query-actions :- [:sequential (ms/InstanceOf :model/QueryAction)]
  "The QueryActions of the Actions with `action-ids`."
  [action-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/QueryAction :action_id [:in action-ids]))

(mu/defn query-action :- [:maybe (ms/InstanceOf :model/QueryAction)]
  "The QueryAction of the Action with `action-id`, or nil."
  [action-id :- ms/PositiveInt]
  (t2/select-one :model/QueryAction :action_id action-id))

(mu/defn http-actions :- [:sequential (ms/InstanceOf :model/HTTPAction)]
  "The HTTPActions of the Actions with `action-ids`."
  [action-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/HTTPAction :action_id [:in action-ids]))

(mu/defn implicit-actions :- [:sequential (ms/InstanceOf :model/ImplicitAction)]
  "The ImplicitActions of the Actions with `action-ids`."
  [action-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/ImplicitAction :action_id [:in action-ids]))

(mu/defn actions-with-id :- [:sequential (ms/InstanceOf :model/Action)]
  "The Actions with `action-id` (usually a single Action, since ids are unique)."
  [action-id :- ms/PositiveInt]
  (t2/select :model/Action :id action-id))

(mu/defn actions-with-ids :- [:sequential (ms/InstanceOf :model/Action)]
  "The Actions whose `:id` is in `action-ids`."
  [action-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Action :id [:in action-ids]))

(mu/defn unarchived-action-with-id :- [:sequential (ms/InstanceOf :model/Action)]
  "The unarchived Actions with `action-id` (usually a single Action, since ids are unique)."
  [action-id :- ms/PositiveInt]
  (t2/select :model/Action :id action-id :archived false))

(mu/defn action-with-entity-id :- [:sequential (ms/InstanceOf :model/Action)]
  "The Actions with `entity-id` (usually a single Action, since entity ids are unique)."
  [entity-id :- :string]
  (t2/select :model/Action :entity_id entity-id))

(mu/defn actions-of-type :- [:sequential (ms/InstanceOf :model/Action)]
  "The Actions of `action-type`."
  [action-type :- :keyword]
  (t2/select :model/Action :type action-type))

(mu/defn unarchived-actions-for-models :- [:sequential (ms/InstanceOf :model/Action)]
  "The unarchived Actions whose `:model_id` is in `model-ids`."
  [model-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Action :model_id [:in model-ids] :archived false))

(mu/defn unarchived-non-http-actions-for-model :- [:sequential (ms/InstanceOf :model/Action)]
  "The unarchived, non-HTTP Actions of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select :model/Action :model_id model-id :archived false :type [:not= "http"]))

(mu/defn unarchived-non-http-actions-for-models :- [:sequential (ms/InstanceOf :model/Action)]
  "The unarchived, non-HTTP Actions whose `:model_id` is in `model-ids`."
  [model-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/Action :model_id [:in model-ids] :archived false :type [:not= "http"]))

(mu/defn fields-for-parameters :- [:sequential (ms/InstanceOf :model/Field)]
  "The id, base type, display name, and description of the Fields with `field-ids`."
  [field-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Field :id :base_type :display_name :description] :id [:in field-ids]))

(mu/defn action-database-settings :- [:sequential [:map {:closed true} [:id ms/PositiveInt] [:settings [:maybe :map]]]]
  "The id and Database settings of the Actions with `action-ids`."
  [action-ids :- [:seqable ms/PositiveInt]]
  (t2/query {:select [:action.id :db.settings]
             :from   :action
             :join   [[:report_card :card] [:= :card.id :action.model_id]
                      [:metabase_database :db] [:= :db.id :card.database_id]]
             :where  [:in :action.id action-ids]}))

(mu/defn card-scope-columns :- [:maybe (ms/InstanceOf :model/Card)]
  "The query, Collection id, Database id, and display of the Card with `card-id`, or nil."
  [card-id :- ms/PositiveInt]
  (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id))

(mu/defn dashboard-collection-id :- [:maybe ms/PositiveInt]
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ms/PositiveInt]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(mu/defn destination-database-exists-for-router? :- :boolean
  "Whether the Database with `database-id` has routing destinations."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Database :router_database_id database-id))

(mu/defn writable-table-exists? :- :boolean
  "Whether the Database with `database-id` has a writable Table."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Table :db_id database-id :is_writable true))

(mu/defn table-with-unknown-writability-exists? :- :boolean
  "Whether the Database with `database-id` has a Table whose writability is unknown."
  [database-id :- ms/PositiveInt]
  (t2/exists? :model/Table :db_id database-id :is_writable nil))
