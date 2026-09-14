(ns metabase.view-log.schema
  "Malli schemas for the view-log module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::view-log.metadata
  "The `:metadata` column of a ViewLog, decoded."
  :map)

(mr/def ::view-log
  "A ViewLog as selected from the app DB: every column of `:view_log`."
  [:map {:closed true}
   [:id                          ms/PositiveInt]
   [:user_id                     [:maybe ::lib.schema.id/user]]
   [:model                       [:or :keyword :string]]
   [:model_id                    [:maybe :int]]
   [:timestamp                   ms/TemporalInstant]
   [:metadata                    [:maybe ::view-log.metadata]]
   [:has_access                  [:maybe :boolean]]
   [:context                     [:maybe [:or :keyword :string]]]
   [:embedding_client            [:maybe :string]]
   [:embedding_sdk_version       [:maybe :string]]
   [:auth_method                 [:maybe [:or :keyword :string]]]
   [:tenant_id                   [:maybe ms/PositiveInt]]
   [:embedding_hostname          [:maybe :string]]
   [:embedding_path              [:maybe :string]]
   [:user_agent                  [:maybe :string]]
   [:ip_address                  [:maybe :string]]
   [:sanitized_user_agent        [:maybe :string]]
   [:embedding_route             [:maybe :string]]
   [:metabase_version            [:maybe :string]]
   [:embedding_client_identifier [:maybe :string]]])

(mr/def ::view-log.update
  "What an update (or insert) of a ViewLog accepts: every column of `:view_log` except `id`, all optional."
  [:map {:closed true}
   [:user_id                     {:optional true} [:maybe ::lib.schema.id/user]]
   [:model                       {:optional true} [:maybe [:or :keyword :string]]]
   [:model_id                    {:optional true} [:maybe :int]]
   [:timestamp                   {:optional true} [:maybe ms/TemporalInstant]]
   [:metadata                    {:optional true} [:maybe ::view-log.metadata]]
   [:has_access                  {:optional true} [:maybe :boolean]]
   [:context                     {:optional true} [:maybe [:or :keyword :string]]]
   [:embedding_client            {:optional true} [:maybe :string]]
   [:embedding_sdk_version       {:optional true} [:maybe :string]]
   [:auth_method                 {:optional true} [:maybe [:or :keyword :string]]]
   [:tenant_id                   {:optional true} [:maybe ms/PositiveInt]]
   [:embedding_hostname          {:optional true} [:maybe :string]]
   [:embedding_path              {:optional true} [:maybe :string]]
   [:user_agent                  {:optional true} [:maybe :string]]
   [:ip_address                  {:optional true} [:maybe :string]]
   [:sanitized_user_agent        {:optional true} [:maybe :string]]
   [:embedding_route             {:optional true} [:maybe :string]]
   [:metabase_version            {:optional true} [:maybe :string]]
   [:embedding_client_identifier {:optional true} [:maybe :string]]])
