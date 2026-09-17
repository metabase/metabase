(ns metabase.actions.db
  "Application database queries for the actions module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`).

  `:model/Action` is stored across four tables (the base `action` row, plus one of `http_action`/`implicit_action`/
  `query_action`), so each gets its own small read/write family below; the cross-table composition that joins or
  dispatches across them lives in `metabase.actions.models`. Queries that do not fit any of those families live in
  the actions-only section at the bottom of this namespace."
  (:require
   [metabase.actions.schema :as actions.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.db :as queries.db]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Action -------------------------------------------------

(mr/def ::action-filters
  "Which Actions a query applies to. Keys mirror the columns of `action`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id        {:optional true} [:or ::lib.schema.id/action [:set ::lib.schema.id/action]]]
   [:model_id  {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:archived  {:optional true} :boolean]
   [:type      {:optional true} [:or :keyword [:set :keyword]]]
   [:entity_id {:optional true} :string]])

(mr/def ::action-opts
  "The filters above plus the order to return them in."
  [:merge
   ::action-filters
   [:map {:closed true}
    [:order-by {:optional true} [:sequential [:or :keyword [:tuple :keyword [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- action-args
  [opts]
  (u.query/opts->args opts))

(defn- action-kv-args
  [opts]
  (u.query/opts->kv-args opts))

(mu/defn select-actions :- [:sequential ::actions.schema/action]
  "The Actions matching `opts`."
  ([]
   (select-actions nil))
  ([opts :- [:maybe ::action-opts]]
   (apply t2/select :model/Action (action-args opts))))

(mu/defn insert-action! :- ::actions.schema/action
  "Insert the Action `row` and return the inserted instance."
  [row :- ::actions.schema/action.for-insert]
  (t2/insert-returning-instance! :model/Action row))

(mu/defn update-actions! :- :int
  "Apply `changes` to every Action matching `opts`, returning the number updated."
  [opts    :- [:maybe ::action-opts]
   changes :- ::actions.schema/action.for-update]
  (apply t2/update! :model/Action (conj (action-kv-args opts) changes)))

;;; ------------------------------------------------ HTTPAction ------------------------------------------------

(mr/def ::httpaction-filters
  "Which HTTPActions a query applies to. Keys mirror the columns of `http_action`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:action_id {:optional true} [:or ::lib.schema.id/action [:set ::lib.schema.id/action]]]])

(mu/defn select-http-actions :- [:sequential ::actions.schema/httpaction]
  "The HTTPActions matching `opts`."
  [opts :- [:maybe ::httpaction-filters]]
  (apply t2/select :model/HTTPAction (u.query/opts->args opts)))

(mu/defn insert-http-action! :- :int
  "Insert the HTTPAction `row`, returning the number inserted."
  [row :- ::actions.schema/httpaction.create]
  (t2/insert! :model/HTTPAction row))

(mu/defn update-http-actions! :- :int
  "Apply `changes` to every HTTPAction matching `opts`, returning the number updated."
  [opts    :- [:maybe ::httpaction-filters]
   changes :- ::actions.schema/httpaction.update]
  (apply t2/update! :model/HTTPAction (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-http-actions! :- :int
  "Delete every HTTPAction matching `opts`, returning the number deleted."
  [opts :- [:maybe ::httpaction-filters]]
  (apply t2/delete! :model/HTTPAction (u.query/opts->args opts)))

;;; ---------------------------------------------- ImplicitAction ----------------------------------------------

(mr/def ::implicit-action-filters
  "Which ImplicitActions a query applies to. Keys mirror the columns of `implicit_action`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:action_id {:optional true} [:or ::lib.schema.id/action [:set ::lib.schema.id/action]]]])

(mu/defn select-implicit-actions :- [:sequential ::actions.schema/implicit-action.row]
  "The ImplicitActions matching `opts`."
  [opts :- [:maybe ::implicit-action-filters]]
  (apply t2/select :model/ImplicitAction (u.query/opts->args opts)))

(mu/defn insert-implicit-action! :- :int
  "Insert the ImplicitAction `row`, returning the number inserted."
  [row :- ::actions.schema/implicit-action.create]
  (t2/insert! :model/ImplicitAction row))

(mu/defn update-implicit-actions! :- :int
  "Apply `changes` to every ImplicitAction matching `opts`, returning the number updated."
  [opts    :- [:maybe ::implicit-action-filters]
   changes :- ::actions.schema/implicit-action.update]
  (apply t2/update! :model/ImplicitAction (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-implicit-actions! :- :int
  "Delete every ImplicitAction matching `opts`, returning the number deleted."
  [opts :- [:maybe ::implicit-action-filters]]
  (apply t2/delete! :model/ImplicitAction (u.query/opts->args opts)))

;;; ----------------------------------------------- QueryAction ------------------------------------------------

(mr/def ::query-action-filters
  "Which QueryActions a query applies to. Keys mirror the columns of `query_action`: a scalar matches that value and
  a set matches any of its values."
  [:map {:closed true}
   [:action_id {:optional true} [:or ::lib.schema.id/action [:set ::lib.schema.id/action]]]])

(mu/defn select-query-actions :- [:sequential ::actions.schema/query-action.row]
  "The QueryActions matching `opts`."
  [opts :- [:maybe ::query-action-filters]]
  (apply t2/select :model/QueryAction (u.query/opts->args opts)))

(mu/defn select-one-query-action :- [:maybe ::actions.schema/query-action.row]
  "The first QueryAction matching `opts`, or nil."
  [opts :- [:maybe ::query-action-filters]]
  (apply t2/select-one :model/QueryAction (u.query/opts->args opts)))

(mu/defn insert-query-action! :- :int
  "Insert the QueryAction `row`, returning the number inserted."
  [row :- ::actions.schema/query-action.create]
  (t2/insert! :model/QueryAction row))

(mu/defn update-query-actions! :- :int
  "Apply `changes` to every QueryAction matching `opts`, returning the number updated."
  [opts    :- [:maybe ::query-action-filters]
   changes :- ::actions.schema/query-action.update]
  (apply t2/update! :model/QueryAction (conj (u.query/opts->kv-args opts) changes)))

(mu/defn delete-query-actions! :- :int
  "Delete every QueryAction matching `opts`, returning the number deleted."
  [opts :- [:maybe ::query-action-filters]]
  (apply t2/delete! :model/QueryAction (u.query/opts->args opts)))

;;; ------------------------------------- Queries used only by the actions module -------------------------------------

(mu/defn database-for-action
  "The Database of the model Card of the Action with `action-id`, or nil."
  [action-id :- ::lib.schema.id/action]
  (t2/select-one :model/Database {:select [:db.*]
                                  :from   :action
                                  :join   [[:report_card :card] [:= :card.id :action.model_id]
                                           [:metabase_database :db] [:= :db.id :card.database_id]]
                                  :where  [:= :action.id action-id]}))

(mu/defn select-table-database-id
  "The Database id of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id [:model/Table :db_id] :id table-id {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(mu/defn select-card-query
  "The query of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :dataset_query :model/Card :id card-id))

(mu/defn select-card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn select-cards
  "The Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn select-cards-by-id
  "A map of Card id to Card for the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn select-card-type
  "The type of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :type [:model/Card :type :card_schema] :id card-id))

(mu/defn select-table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn select-tables
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids] {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn select-dashcard-in-dashboard
  "The DashboardCard with `dashcard-id` on the Dashboard with `dashboard-id`, or nil."
  [dashcard-id  :- ::lib.schema.id/dashcard
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/DashboardCard :id dashcard-id :dashboard_id dashboard-id))

(mu/defn select-dashcard-dashboard-id
  "The `:dashboard_id` of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :dashboard_id [:model/DashboardCard :dashboard_id] dashcard-id))

(mu/defn select-dashcard-action-id
  "The Action id of the DashboardCard with `dashcard-id`, or nil."
  [dashcard-id :- ::lib.schema.id/dashcard]
  (t2/select-one-fn :action_id :model/DashboardCard :id dashcard-id))

(mu/defn delete-dashcards-for-action!
  "Delete the DashboardCards of the Action with `action-id`, returning the number deleted."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/DashboardCard :action_id action-id))

(mu/defn insert-query-execution!
  "Insert the QueryExecution `row` and return its id."
  [row :- ::queries.schema/query-execution.create]
  (queries.db/insert-query-execution! row))

(mu/defn select-unarchived-non-http-actions-for-model
  "The unarchived, non-HTTP Actions of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select :model/Action :model_id model-id :archived false :type [:not= "http"]))

(mu/defn select-unarchived-non-http-actions-for-models
  "The unarchived, non-HTTP Actions whose `:model_id` is in `model-ids`."
  [model-ids :- [:set ms/PositiveInt]]
  (t2/select :model/Action :model_id [:in model-ids] :archived false :type [:not= "http"]))

(mu/defn select-fields-for-parameters
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

(mu/defn select-card-scope-columns
  "The query, Collection id, Database id, and display of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :dataset_query :collection_id :database_id :display] card-id))

(mu/defn select-dashboard-collection-id
  "The Collection id of the Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] dashboard-id))

(mu/defn writable-table-exists?
  "Whether the Database with `database-id` has a writable Table."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id :is_writable true {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn table-with-unknown-writability-exists?
  "Whether the Database with `database-id` has a Table whose writability is unknown."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table :db_id database-id :is_writable nil {:from [(warehouse-schema-overlay/table-query)]}))
