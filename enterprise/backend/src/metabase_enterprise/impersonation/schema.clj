(ns metabase-enterprise.impersonation.schema
  "Malli schemas for the impersonation module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::impersonation-query-cache.result
  "The outcome of validating an impersonated native query, as an ImpersonationQueryCache records it."
  [:enum :valid :unparseable :unvalidatable :invalid])

(mr/def ::impersonation-query-cache
  "An ImpersonationQueryCache as selected from the app DB: every column of `:impersonation_query_cache`."
  [:merge
   ::impersonation-query-cache.update
   [:map {:closed true}
    [:id               ms/PositiveInt]
    [:input_query_hash :string]]])

(mr/def ::impersonation-query-cache.update
  "What an update (or insert) of an ImpersonationQueryCache accepts: every column of `:impersonation_query_cache` except `id`, all optional."
  [:map {:closed true}
   [:input_version     {:optional true} :string]
   [:input_engine      {:optional true} :keyword]
   [:input_allow_write {:optional true} :boolean]
   [:input_admin       {:optional true} :boolean]
   [:input_query       {:optional true} :string]
   [:result            {:optional true} ::impersonation-query-cache.result]
   [:result_query      {:optional true} [:maybe :string]]
   [:result_reason     {:optional true} [:maybe :string]]
   [:created_at        {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]])
