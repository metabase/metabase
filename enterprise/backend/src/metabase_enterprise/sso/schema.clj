(ns metabase-enterprise.sso.schema
  "Malli schemas for the sso module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::sso-relay-state
  "A SsoRelayState as selected from the app DB: every column of `:sso_relay_state`."
  [:merge
   ::sso-relay-state.columns
   [:map {:closed true}
    [:id           :string]]])

(mr/def ::sso-relay-state.columns
  "Every column of `:sso_relay_state` except `id`, all optional."
  [:map {:closed true}
   [:continue_url {:optional true} [:maybe :string]]
   [:origin       {:optional true} [:maybe :string]]
   [:embedding    {:optional true} [:maybe :boolean]]
   [:expires_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]])

(mr/def ::sso-relay-state.create
  "What an insert of a SsoRelayState accepts: `:id` (the caller-supplied hashed key) plus every column but
  `created_at`, which is set for it."
  [:merge
   (mut/select-keys (mr/schema ::sso-relay-state.columns) [:continue_url :origin :embedding :expires_at])
   [:map {:closed true} [:id :string]]])

(mr/def ::sso-relay-state.update
  "What an update of a SsoRelayState accepts: every column but `id` and `created_at`, which do not change."
  (mut/select-keys (mr/schema ::sso-relay-state.columns) [:continue_url :origin :embedding :expires_at]))

(mr/def ::sso-relay-state.partial
  "A SsoRelayState row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::sso-relay-state [:map {:closed true} [:id {:optional true} :string]]])

(mr/def ::sso-relay-state.column
  "A column of `sso_relay_state`, for the `:columns` option of the queries in [[metabase-enterprise.sso.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::sso-relay-state.columns))))
