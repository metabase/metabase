(ns metabase.session.schema
  (:require
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
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:anti_csrf_token     {:optional true} [:maybe :string]]
   [:key_hashed          {:optional true} [:maybe :string]]
   [:auth_identity_id    {:optional true} [:maybe ms/PositiveInt]]
   [:expires_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:last_active_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:saml_session_index  {:optional true} [:maybe :string]]
   [:saml_name_id        {:optional true} [:maybe :string]]
   [:saml_name_id_format {:optional true} [:maybe :string]]])
