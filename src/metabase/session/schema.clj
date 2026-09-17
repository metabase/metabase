(ns metabase.session.schema
  (:require
   [malli.util :as mut]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def SessionSchema
  "Schema for a Session."
  [:and
   [:map-of :keyword :any]
   [:map
    [:key string?]
    [:type [:enum :normal :full-app-embed]]]])

(mr/def ::session
  "A Session as selected from the app DB: every column of `:core_session`."
  [:merge
   ::session.update
   [:map {:closed true}
    [:id                   :string]
    [:key                  {:optional true} :string]
    [:type                 {:optional true} [:enum :normal :full-app-embed]]
    [:mfa_auth_identity_id {:optional true} [:maybe ms/PositiveInt]]]])

(mr/def ::session.update
  "What an update (or insert) of a Session accepts: every column of `:core_session` except `id`, all optional."
  [:map {:closed true}
   [:user_id             {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:anti_csrf_token     {:optional true} [:maybe :string]]
   [:key_hashed          {:optional true} [:maybe :string]]
   [:auth_identity_id    {:optional true} [:maybe ms/PositiveInt]]
   [:expires_at          {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:last_active_at      {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:saml_session_index  {:optional true} [:maybe :string]]
   [:saml_name_id        {:optional true} [:maybe :string]]
   [:saml_name_id_format {:optional true} [:maybe :string]]])

(mr/def ::session.column
  "A column of `core_session`, for the `:columns` option of the queries in [[metabase.session.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::session.update))))
