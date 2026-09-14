(ns metabase-enterprise.sso.schema
  "Malli schemas for the sso module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::sso-relay-state
  "A SsoRelayState as selected from the app DB: every column of `:sso_relay_state`."
  [:map {:closed true}
   [:id           :string]
   [:continue_url :string]
   [:origin       [:maybe :string]]
   [:embedding    :boolean]
   [:expires_at   ms/TemporalInstant]
   [:created_at   ms/TemporalInstant]])

(mr/def ::sso-relay-state.update
  "What an update (or insert) of a SsoRelayState accepts: every column of `:sso_relay_state` except `id`, all optional."
  [:map {:closed true}
   [:continue_url {:optional true} [:maybe :string]]
   [:origin       {:optional true} [:maybe :string]]
   [:embedding    {:optional true} [:maybe :boolean]]
   [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]])
