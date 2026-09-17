(ns metabase.cloud-migration.schema
  "Malli schemas for the cloud-migration module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::cloud-migration
  "A CloudMigration as selected from the app DB: every column of `:cloud_migration`."
  [:merge
   ::cloud-migration.columns
   [:map {:closed true}
    [:id          ms/PositiveInt]]])

(mr/def ::cloud-migration.partial
  "A CloudMigration row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::cloud-migration [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::cloud-migration.columns
  "Every column of `:cloud_migration` except `id`, all optional."
  [:map {:closed true}
   [:external_id {:optional true} [:maybe [:or :string :int]]]
   [:upload_url  {:optional true} [:maybe :string]]
   [:state       {:optional true} [:maybe [:or :keyword :string]]]
   [:progress    {:optional true} [:maybe :int]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::cloud-migration.create
  "What an insert of a CloudMigration accepts."
  (mut/select-keys (mr/schema ::cloud-migration.columns) [:external_id :upload_url :state :progress :created_at :updated_at]))

(mr/def ::cloud-migration.update
  "What an update of a CloudMigration accepts: every column but `:created_at`, which nothing ever updates."
  (mut/select-keys (mr/schema ::cloud-migration.columns) [:external_id :upload_url :state :progress :updated_at]))

(mr/def ::cloud-migration.column
  "A column of `cloud_migration`, for the `:columns` option of the queries in [[metabase.cloud-migration.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::cloud-migration.columns))))
