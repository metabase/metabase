(ns metabase-enterprise.database-routing.db
  "Application database queries for `:model/DatabaseRouter`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace runs a DatabaseRouter query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the database-routing-only section at the
  bottom of this namespace."
  (:require
   [metabase-enterprise.database-routing.schema :as database-routing.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which DatabaseRouters a query applies to. Keys mirror the columns of `db_router`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id             {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:database_id    {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:user_attribute {:optional true} :string]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::database-routing.schema/database-router.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::database-routing.schema/database-router.column
                                              [:tuple ::database-routing.schema/database-router.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/DatabaseRouter columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-database-router :- [:maybe ::database-routing.schema/database-router.partial]
  "The first DatabaseRouter matching `opts`, or nil."
  ([]
   (select-one-database-router nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn database-router-exists? :- :boolean
  "Whether a DatabaseRouter matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/DatabaseRouter (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-database-router! :- ::database-routing.schema/database-router
  "Insert the DatabaseRouter `row` and return the inserted instance."
  [row :- ::database-routing.schema/database-router.create]
  (t2/insert-returning-instance! :model/DatabaseRouter row))

(mu/defn update-database-routers! :- :int
  "Apply `changes` to every DatabaseRouter matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::database-routing.schema/database-router.update]
  (apply t2/update! :model/DatabaseRouter (conj (->kv-args opts) changes)))

(mu/defn delete-database-routers! :- :int
  "Delete every DatabaseRouter matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/DatabaseRouter (->args opts)))

;;; ------------------------------ Queries used only by the database-routing module ------------------------------

(mu/defn transform-exists-for-source-database?
  "Whether a Transform reads from the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Transform :source_database_id database-id))

(mu/defn select-database-router-user-attribute-by-database-id
  "A map of Database id to routing user attribute, for `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select-fn->fn :database_id :user_attribute :model/DatabaseRouter :database_id [:in database-ids]))
