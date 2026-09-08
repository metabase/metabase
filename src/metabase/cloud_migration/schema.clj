(ns metabase.cloud-migration.schema
  "Malli schemas for the cloud-migration module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::cloud-migration
  "A CloudMigration as selected from the app DB: every column of `:cloud_migration`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:external_id [:or :string :map sequential?]]
   [:upload_url  [:or :string :map sequential?]]
   [:state       [:or :string :map sequential?]]
   [:progress    :int]
   [:created_at  ms/TemporalInstant]
   [:updated_at  ms/TemporalInstant]])

(mr/def ::cloud-migration.update
  "What an update (or insert) of a CloudMigration accepts: every column of `:cloud_migration` except `id`, all optional."
  [:map {:closed true}
   [:external_id {:optional true} [:maybe [:or :string :map sequential?]]]
   [:upload_url  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:state       {:optional true} [:maybe [:or :string :map sequential?]]]
   [:progress    {:optional true} [:maybe :int]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at  {:optional true} [:maybe ms/TemporalInstant]]])
