(ns metabase-enterprise.data-apps.schema
  "Malli schemas for the data-apps module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-app
  "A DataApp as selected from the app DB: every column of `:data_app`."
  [:merge
   ::data-app.columns
   [:map {:closed true}
    [:id              ms/PositiveInt]]])

(mr/def ::data-app.partial
  "A DataApp row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::data-app [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::data-app.columns
  "Every column of `:data_app` except `id`, all optional."
  [:map {:closed true}
   [:name            {:optional true} [:maybe :string]]
   [:display_name    {:optional true} [:maybe :string]]
   [:allowed_hosts   {:optional true} [:maybe [:sequential :string]]]
   [:bundle_path     {:optional true} [:maybe :string]]
   [:bundle          {:optional true} [:maybe [:or bytes? :string]]]
   [:bundle_hash     {:optional true} [:maybe :string]]
   [:last_synced_sha {:optional true} [:maybe :string]]
   [:last_synced_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:sync_error      {:optional true} [:maybe :string]]
   [:enabled         {:optional true} [:maybe :boolean]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:description     {:optional true} [:maybe :string]]
   [:resource_collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:permission_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:table_ids              {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:draft                  {:optional true} [:maybe :boolean]]])

(mr/def ::data-app.create
  "What an insert of a DataApp accepts."
  (mut/select-keys (mr/schema ::data-app.columns)
                   [:name :display_name :allowed_hosts :bundle_path :bundle :bundle_hash :last_synced_sha
                    :last_synced_at :sync_error :enabled :created_at :updated_at :description
                    :resource_collection_id :permission_group_id :table_ids :draft]))

(mr/def ::data-app.update
  "What an update of a DataApp accepts: every column but `:name`, an immutable slug nothing ever updates, and
  `:created_at`."
  (mut/select-keys (mr/schema ::data-app.columns)
                   [:display_name :allowed_hosts :bundle_path :bundle :bundle_hash :last_synced_sha
                    :last_synced_at :sync_error :enabled :updated_at :description
                    :resource_collection_id :permission_group_id :table_ids :draft]))

(mr/def ::data-app.column
  "A column of `data_app`, for the `:columns` option of the queries in [[metabase-enterprise.data-apps.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::data-app.columns))))
