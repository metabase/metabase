(ns metabase.auth-identity.schema
  "Malli schemas for the auth-identity module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::auth-identity.credentials
  "The `:credentials` column of a AuthIdentity, decoded."
  :map)

(mr/def ::auth-identity.metadata
  "The `:metadata` column of a AuthIdentity, decoded."
  :map)

(mr/def ::auth-identity
  "A AuthIdentity as selected from the app DB: every column of `:auth_identity`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:user_id      ::lib.schema.id/user]
   [:provider     [:or :keyword :string]]
   [:credentials  [:maybe ::auth-identity.credentials]]
   [:metadata     [:maybe ::auth-identity.metadata]]
   [:provider_id  [:maybe :string]]
   [:last_used_at [:maybe ms/TemporalInstant]]
   [:expires_at   [:maybe ms/TemporalInstant]]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]
   [:confirmed_at [:maybe ms/TemporalInstant]]])

(mr/def ::auth-identity.update
  "What an update (or insert) of a AuthIdentity accepts: every column of `:auth_identity` except `id`, all optional."
  [:map {:closed true}
   [:user_id      {:optional true} [:maybe ::lib.schema.id/user]]
   [:provider     {:optional true} [:maybe [:or :keyword :string]]]
   [:credentials  {:optional true} [:maybe ::auth-identity.credentials]]
   [:metadata     {:optional true} [:maybe ::auth-identity.metadata]]
   [:provider_id  {:optional true} [:maybe :string]]
   [:last_used_at {:optional true} [:maybe ms/TemporalInstant]]
   [:expires_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:confirmed_at {:optional true} [:maybe ms/TemporalInstant]]])
