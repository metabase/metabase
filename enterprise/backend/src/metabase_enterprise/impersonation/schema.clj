(ns metabase-enterprise.impersonation.schema
  "Malli schemas for the impersonation module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::connection-impersonation
  "A ConnectionImpersonation as selected from the app DB: every column of `:connection_impersonations`."
  [:merge
   ::connection-impersonation.update
   [:map {:closed true}
    [:id        ms/PositiveInt]]])

(mr/def ::connection-impersonation.update
  "What an update (or insert) of a ConnectionImpersonation accepts: every column of `:connection_impersonations` except `id`, all optional."
  [:map {:closed true}
   [:db_id     {:optional true} [:maybe ::lib.schema.id/database]]
   [:group_id  {:optional true} [:maybe ms/PositiveInt]]
   [:attribute {:optional true} [:maybe :string]]])

(mr/def ::query-cache.input
  "The `input` columns that look up an ImpersonationQueryCache row."
  [:map {:closed true}
   [:input_version     :string]
   [:input_engine      :string]
   [:input_allow_write :boolean]
   [:input_admin       :boolean]
   [:input_query_hash  :string]
   [:input_query       :string]])

(mr/def ::query-cache.result
  "The `result` columns of an ImpersonationQueryCache row."
  [:map {:closed true}
   [:result        [:enum :valid :unparseable :unvalidatable :invalid]]
   [:result_query  {:optional true} [:maybe :string]]
   [:result_reason {:optional true} [:maybe :string]]])

(mr/def ::query-cache.row
  "What an insert of an ImpersonationQueryCache row accepts."
  [:merge ::query-cache.input ::query-cache.result])

(mr/def ::query-cache.cached
  "An ImpersonationQueryCache row as looked up: its `input_query` and its results."
  [:merge
   [:map {:closed true}
    [:input_query :string]]
   ::query-cache.result])
