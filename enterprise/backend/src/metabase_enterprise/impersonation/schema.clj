(ns metabase-enterprise.impersonation.schema
  "Malli schemas for the impersonation module."
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::connection-impersonation.attribute
  "The `:attribute` of a ConnectionImpersonation: the non-blank name of the user attribute that holds the role."
  ms/NonBlankString)

(mr/def ::connection-impersonation
  "A ConnectionImpersonation as selected from the app DB: every column of `:connection_impersonations`."
  ::connection-impersonation.update)

(mr/def ::connection-impersonation.update
  "What an update of a ConnectionImpersonation takes: its `:id` and every other column of `:connection_impersonations`,
  all optional."
  [:map {:closed true}
   [:id        ms/PositiveInt]
   [:db_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:attribute {:optional true} ::connection-impersonation.attribute]])

(mr/def ::impersonation-query-cache.result
  "The outcome of validating an impersonated native query, as an ImpersonationQueryCache records it."
  [:enum :valid :unparseable :unvalidatable :invalid])

(mr/def ::impersonation-query-cache
  "An ImpersonationQueryCache as selected from the app DB: every column of `:impersonation_query_cache`."
  [:merge
   ::impersonation-query-cache.update
   [:map {:closed true}
    [:input_query_hash :string]]])

(mr/def ::impersonation-query-cache.update
  "What an update of an ImpersonationQueryCache takes: its `:id` and every other column of `:impersonation_query_cache`
  but the hash of its query, all optional."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:input_version     {:optional true} :string]
   [:input_engine      {:optional true} :keyword]
   [:input_allow_write {:optional true} :boolean]
   [:input_admin       {:optional true} :boolean]
   [:input_query       {:optional true} :string]
   [:result            {:optional true} ::impersonation-query-cache.result]
   [:result_query      {:optional true} [:maybe :string]]
   [:result_reason     {:optional true} [:maybe :string]]
   [:created_at        {:optional true} (ms/InstanceOfClass java.time.temporal.Temporal)]])

(mr/def ::impersonation-query-cache.create
  "What storing an ImpersonationQueryCache takes: the columns of an update without the `:id`."
  (mut/dissoc ::impersonation-query-cache.update :id))

(mr/def ::impersonation-query-cache.lookup
  "The columns that look an ImpersonationQueryCache up: the hash of its native query and the inputs it was validated
  with."
  [:map {:closed true}
   [:input_query_hash  :string]
   [:input_engine      :keyword]
   [:input_allow_write :boolean]
   [:input_admin       :boolean]
   [:input_version     :string]])
