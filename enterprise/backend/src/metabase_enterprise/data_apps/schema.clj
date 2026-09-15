(ns metabase-enterprise.data-apps.schema
  "Malli schemas for the data-apps module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-app
  "A DataApp as selected from the app DB: every column of `:data_app`."
  [:merge
   ::data-app.update
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_apps/schema.clj:11"}
    [:id              ms/PositiveInt]]])

(mr/def ::data-app.update
  "What an update (or insert) of a DataApp accepts: every column of `:data_app` except `id`, all optional."
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
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:description     {:optional true} [:maybe :string]]
   [:resource_collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:permission_group_id    {:optional true} [:maybe ms/PositiveInt]]
   [:table_ids              {:optional true} [:maybe [:sequential ms/PositiveInt]]]
   [:draft                  {:optional true} [:maybe :boolean]]])
