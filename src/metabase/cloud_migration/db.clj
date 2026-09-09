(ns metabase.cloud-migration.db
  "Application database queries for the cloud migration module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.cloud-migration.schema :as cloud-migration.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn cloud-migration-not-in-states :- [:maybe ::cloud-migration.schema/cloud-migration]
  "A CloudMigration whose state is not one of `states`, or nil."
  [states :- [:set [:or :keyword :string]]]
  (t2/select-one :model/CloudMigration :state [:not-in states]))

(mu/defn insert-cloud-migration! :- ::cloud-migration.schema/cloud-migration
  "Insert the CloudMigration `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:id          {:optional true} ms/PositiveInt]
           [:external_id {:optional true} [:maybe [:or :string :int]]]
           [:upload_url  {:optional true} [:maybe [:or :string :map sequential?]]]
           [:state       {:optional true} [:or :keyword :string]]
           [:progress    {:optional true} [:maybe :int]]
           [:created_at  {:optional true} ms/TemporalInstant]
           [:updated_at  {:optional true} ms/TemporalInstant]]]
  (t2/insert-returning-instance! :model/CloudMigration row))

(mu/defn latest-cloud-migration :- [:maybe ::cloud-migration.schema/cloud-migration]
  "The most recently created CloudMigration, or nil."
  []
  (t2/select-one :model/CloudMigration {:order-by [[:created_at :desc]]}))

(mu/defn cancel-cloud-migrations-not-in-states! :- :int
  "Cancel every CloudMigration whose state is not one of `states`."
  [states :- [:set [:or :keyword :string]]]
  (t2/update! :model/CloudMigration {:state [:not-in states]} {:state :cancelled}))

(mu/defn quartz-node-count :- ms/IntGreaterThanOrEqualToZero
  "The number of Quartz scheduler nodes recorded in the app DB."
  []
  (t2/count (if (= (mdb/db-type) :postgres)
              "qrtz_scheduler_state"
              "QRTZ_SCHEDULER_STATE")))

(mu/defn set-cloud-migration-progress-if-not-in-states! :- :int
  "Set the state and progress of the CloudMigration with `id` unless its state is one of `states`, returning the
  number of rows updated."
  [id       :- ms/PositiveInt
   states   :- [:set [:or :keyword :string]]
   state    :- [:or :keyword :string]
   progress :- :int]
  (t2/update! :model/CloudMigration :id id :state [:not-in states] {:state state :progress progress}))

(mu/defn set-cloud-migration-state! :- :int
  "Set the state of the CloudMigration with `id`."
  [id    :- ms/PositiveInt
   state :- [:or :keyword :string]]
  (t2/update! :model/CloudMigration :id id {:state state}))
