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
  [:map {:closed true}
   [:id               :string]
   [:user_id          ::lib.schema.id/user]
   [:created_at       ms/TemporalInstant]
   [:anti_csrf_token  [:maybe :string]]
   [:key_hashed       :string]
   [:auth_identity_id [:maybe ms/PositiveInt]]
   [:expires_at       [:maybe ms/TemporalInstant]]
   [:last_active_at   [:maybe ms/TemporalInstant]]])

(mr/def ::session.update
  "What an update (or insert) of a Session accepts: every column of `:core_session` except `id`, all optional."
  [:map {:closed true}
   [:user_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:created_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:anti_csrf_token  {:optional true} [:maybe :string]]
   [:key_hashed       {:optional true} [:maybe :string]]
   [:auth_identity_id {:optional true} [:maybe ms/PositiveInt]]
   [:expires_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:last_active_at   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::liveness-params
  "The instance-wide inputs to [[metabase.session.query/live-session-conditions]]."
  [:map {:closed true}
   [:db-type                 :keyword]
   [:max-age-minutes         [:maybe :int]]
   [:enable-tenants?         :boolean]
   [:session-timeout-seconds [:maybe :int]]])
