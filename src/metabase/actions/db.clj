(ns metabase.actions.db
  "Application database queries for the actions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.card-schema :as queries.card-schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [toucan2.core :as t2]))

(mu/defn action :- [:maybe ::actions.schema/action]
  "The ::actions.schema/action with `action-id`, or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one :model/Action :id [:auto/param action-id]))

(defn- action-database-joins
  "The joins from `action` to the Database `db` of its query, or for an implicit action of its model Card or its table."
  []
  [[(t2/table-name :model/QueryAction) :qa]    [:= :qa.action_id :action.id]
   [(t2/table-name :model/Card) :card]         [:and [:= :card.id :action.model_id] [:= :action.type "implicit"]]
   [(t2/table-name :model/ImplicitAction) :ia] [:= :ia.action_id :action.id]
   [(t2/table-name :model/Table) :tbl]         [:= :tbl.id :ia.table_id]
   [(t2/table-name :model/Database) :db]       [:= :db.id [:coalesce :qa.database_id :card.database_id :tbl.db_id]]])

(mu/defn database-for-action
  "The Database the Action with `action-id` runs against: its query's, or its model's or table's for an implicit action,
  or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one :model/Database {:select    [:db.*]
                                  :from      [[(t2/table-name :model/Action) :action]]
                                  :left-join (action-database-joins)
                                  :where     [:and [:= :action.id action-id] [:not= :db.id nil]]}))

(mu/defn delete-dashcards-for-action!
  "Delete the DashboardCards of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/DashboardCard :action_id action-id))

(mu/defn insert-query-execution!
  "Insert the QueryExecution `row` and return its id."
  [row :- ::queries.schema/query-execution.update]
  (t2/insert-returning-pk! :model/QueryExecution row))

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

(mu/defn insert-implicit-action!
  "Insert the ImplicitAction `action`, returning the number inserted."
  [action :- ::actions.schema/implicit-action.update]
  (t2/insert! :model/ImplicitAction action))

(mu/defn update-query-action!
  "Apply `changes` to the QueryAction with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/query-action.update]
  (t2/update! :model/QueryAction action-id changes))

(mu/defn update-implicit-action!
  "Apply `changes` to the ImplicitAction with `action-id`, returning the number updated."
  [action-id :- ::lib.schema.id/action
   changes   :- ::actions.schema/implicit-action.update]
  (t2/update! :model/ImplicitAction action-id changes))

(mu/defn delete-query-action!
  "Delete the QueryAction of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/QueryAction :action_id action-id))

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

(mu/defn implicit-action-table-id
  "The Table id of the ImplicitAction of the Action with `action-id`, or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one-fn :table_id [:model/ImplicitAction :table_id] :action_id action-id))

(mu/defn tables-with-fields
  "The Tables with `table-ids`, with their Fields hydrated."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/hydrate (warehouse-schema.db/tables-by-ids {:table-ids table-ids}) :fields))

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

(mu/defn action-database-settings
  "The id and Database settings of the Actions with `action-ids`."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (t2/query {:select    [:action.id :db.settings]
             :from      [[(t2/table-name :model/Action) :action]]
             :left-join (action-database-joins)
             :where     [:and [:in :action.id action-ids] [:not= :db.id nil]]}))

(mu/defn card-scope-columns
  "The query-relevant columns of the Card with `card-id`, plus its Collection id and display, or nil."
  [card-id :- ::lib.schema.id/card]
  ;; Spelled out rather than calling `metabase.queries.core/card-query-info`: `queries` loads `actions` (via
  ;; `driver-api`), so requiring its API namespace back from here is a cyclic load. `queries.card-schema` is the
  ;; dependency-free namespace that exists for exactly this.
  (t2/select-one (queries.card-schema/selection [:collection_id :database_id :display]) :id card-id))

(mu/defn implicit-action-ids-for-table
  "The ids of the implicit Actions that write to the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (t2/select-fn-set :action_id :model/ImplicitAction :table_id [:auto/param table-id]))

(mu/defn query-action-ids-for-database
  "The ids of the query Actions whose query runs against the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/select-fn-set :action_id :model/QueryAction :database_id [:auto/param database-id]))

(mu/defn implicit-action-ids-for-database
  "The ids of the implicit Actions that write to a Table of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (let [[table-subquery _] (warehouse-schema-overlay/table-query)]
    (t2/select-fn-set :action_id :model/ImplicitAction
                      {:join  [[table-subquery :table]
                               [:= :table.id :implicit_action.table_id]]
                       :where [:= :table.db_id [:auto/param database-id]]})))

(mu/defn implicit-action-ids-for-model
  "The ids of the implicit Actions of the model Card with `model-id`."
  [{:keys [model-id]} :- [:map {:closed true}
                          [:model-id ::lib.schema.id/card]]]
  (t2/select-pks-set :model/Action {:select [:action.id]
                                    :from   [:action]
                                    :join   [:implicit_action [:= :action.id :implicit_action.action_id]]
                                    :where  [:= :action.model_id [:auto/param model-id]]}))

(mu/defn actions-for-model
  "The Actions of the model Card with `model-id`."
  [{:keys [model-id]} :- [:map {:closed true}
                          [:model-id ::lib.schema.id/card]]]
  (t2/select :model/Action :model_id [:auto/param model-id]))

(mu/defn action-entity-ids-in
  "The entity ids among `entity-ids` that name an existing Action."
  [{:keys [entity-ids]} :- [:map {:closed true}
                            [:entity-ids [:set :string]]]]
  (t2/select-fn-set :entity_id [:model/Action :entity_id] :entity_id [:in entity-ids]))

(mu/defn action-ids-in-collection
  "The ids of the Actions in the Collection with `collection-id` (nil for the root Collection), excluding archived ones
  when `skip-archived?`."
  [{:keys [collection-id skip-archived?]} :- [:map {:closed true}
                                              [:collection-id  [:maybe ::lib.schema.id/collection]]
                                              [:skip-archived? {:optional true} [:maybe :boolean]]]]
  (t2/select-pks-set :model/Action
                     {:where [:and [:= :collection_id collection-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-action-ids-in-collection-by-name
  "The ids of the unarchived Actions in the Collection with `collection-id`, in name then id order."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id ::lib.schema.id/collection]]]
  (t2/select-pks-vec :model/Action {:where    [:and [:= :collection_id [:auto/param collection-id]] [:= :archived false]]
                                    :order-by [[:name :asc] [:id :asc]]}))

(mu/defn unarchived-action-ids-and-public-uuids-by-prefix
  "The `:id` and `:public_uuid` of the unarchived Actions whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select [:model/Action :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-actions-by-public-uuid-prefix
  "The unarchived Actions whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select :model/Action :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn actions-without-model-in
  "The `:id`, `:name`, and `:collection_id` of the Actions without a model outside of any Collection or in the
  Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/select [:model/Action :id :name :collection_id]
             {:where [:and
                      [:= :model_id nil]
                      (if (seq collection-ids)
                        [:or [:= :collection_id nil] [:in :collection_id collection-ids]]
                        [:= :collection_id nil])]}))

(mu/defn action-exists-in-collections?
  "Whether an Action exists in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/exists? :model/Action :collection_id [:in collection-ids]))

(mu/defn delete-implicit-actions-for-table!
  "Delete the implicit Actions that write to the Table with `table-id`, returning the number deleted."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (if-let [action-ids (not-empty (implicit-action-ids-for-table {:table-id table-id}))]
    (t2/delete! :model/Action :id [:in action-ids])
    0))

(mu/defn delete-actions-for-database!
  "Delete the query Actions whose query runs against the Database with `database-id` and the implicit Actions that write
  to one of its Tables, returning the number deleted."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (if-let [action-ids (not-empty (into (query-action-ids-for-database {:database-id database-id})
                                       (implicit-action-ids-for-database {:database-id database-id})))]
    (t2/delete! :model/Action :id [:in action-ids])
    0))
