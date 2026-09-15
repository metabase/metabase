(ns metabase.view-log.schema
  "Malli schemas for the view-log module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::view-log.metadata
  "The `:metadata` column of a ViewLog, decoded."
  [:map {:closed true, :probe/id "src/metabase/view_log/schema.clj:10"}])

(mr/def ::view-log
  "A ViewLog as selected from the app DB: every column of `:view_log`."
  [:merge
   ::view-log.update
   [:map {:closed true, :probe/id "src/metabase/view_log/schema.clj:16"}
    [:id                          ms/PositiveInt]]])

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
