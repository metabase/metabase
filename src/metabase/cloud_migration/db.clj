(ns metabase.cloud-migration.db
  "Application database queries for `:model/CloudMigration`. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace runs a CloudMigration query itself (model definitions still use
  `toucan2.core`).

  The queries below follow [[::opts]]; queries that do not fit it live in the cloud-migration-only section at the
  bottom of this namespace."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.cloud-migration.schema :as cloud-migration.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which CloudMigrations a query applies to. Keys mirror the columns of `cloud_migration`: a scalar matches that
  value."
  [:map {:closed true}
   [:id    {:optional true} ms/PositiveInt]
   [:state {:optional true} [:or :keyword :string]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::cloud-migration.schema/cloud-migration.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::cloud-migration.schema/cloud-migration.column
                                              [:tuple ::cloud-migration.schema/cloud-migration.column [:enum :asc :desc]]]]]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/CloudMigration columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-one-cloud-migration :- [:maybe ::cloud-migration.schema/cloud-migration.partial]
  "The first CloudMigration matching `opts`, or nil."
  ([]
   (select-one-cloud-migration nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-cloud-migration! :- ::cloud-migration.schema/cloud-migration
  "Insert the CloudMigration `row` and return the inserted instance."
  [row :- ::cloud-migration.schema/cloud-migration.create]
  (t2/insert-returning-instance! :model/CloudMigration row))

(mu/defn update-cloud-migrations! :- :int
  "Apply `changes` to every CloudMigration matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::cloud-migration.schema/cloud-migration.update]
  (apply t2/update! :model/CloudMigration (conj (->kv-args opts) changes)))

;;; --------------------------------- Queries used only by the cloud-migration module ---------------------------------

(mu/defn cloud-migration-not-in-states
  "A CloudMigration whose state is not one of `states`, or nil."
  [states :- [:set [:or :keyword :string]]]
  (t2/select-one :model/CloudMigration :state [:not-in states]))

(mu/defn cancel-cloud-migrations-not-in-states!
  "Cancel every CloudMigration whose state is not one of `states`."
  [states :- [:set [:or :keyword :string]]]
  (t2/update! :model/CloudMigration {:state [:not-in states]} {:state :cancelled}))

(mu/defn quartz-node-count
  "The number of Quartz scheduler nodes recorded in the app DB."
  []
  (t2/count (if (= (mdb/db-type) :postgres)
              "qrtz_scheduler_state"
              "QRTZ_SCHEDULER_STATE")))

(mu/defn set-cloud-migration-progress-if-not-in-states!
  "Set the state and progress of the CloudMigration with `id` unless its state is one of `states`, returning the
  number of rows updated."
  [id       :- ms/PositiveInt
   states   :- [:set [:or :keyword :string]]
   state    :- [:or :keyword :string]
   progress :- :int]
  (t2/update! :model/CloudMigration :id id :state [:not-in states] {:state state :progress progress}))
