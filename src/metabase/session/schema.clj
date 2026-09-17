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

(def ^:private end-reasons
  "Why a session can end (`core_session.end_reason`), one value per path that ends sessions: an admin's revocation,
  the user's own logout, a password change, the user's or their tenant's deactivation, an SSO logout, a support-access
  grant's revocation, expiry (its own `expires_at` or `max-session-age`, one reason), or the idle timeout."
  ["admin" "logout" "password-change" "user-deactivated" "tenant-deactivated" "sso-logout" "support-grant-revoked"
   "expired" "timed-out"])

(mr/def ::end-reason
  (into [:enum] end-reasons))

(mr/def ::end-conditions
  "Which Sessions [[metabase.session.db/end-sessions!]] ends: the ones with these ids, of this user, or with this
  hashed key."
  [:map {:closed true}
   [:id         {:optional true} [:sequential :string]]
   [:user_id    {:optional true} ::lib.schema.id/user]
   [:key_hashed {:optional true} :string]])

(mr/def ::ended-by
  "Who ended a session, for [[metabase.session.db/end-sessions!]]: the id of the person who did, `:self` for the
  session's own user (a logout), or nil when no person did (expiry, a deactivation)."
  [:maybe [:or ::lib.schema.id/user [:= :self]]])

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
   [:saml_name_id_format {:optional true} [:maybe :string]]
   [:ended_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:end_reason          {:optional true} [:maybe ::end-reason]]
   [:ended_by_user_id    {:optional true} [:maybe ::lib.schema.id/user]]])

(mr/def ::liveness-params
  "The instance-wide inputs to [[metabase.session.query/live-session-conditions]]."
  [:map {:closed true}
   [:db-type                 :keyword]
   [:max-age-minutes         [:maybe :int]]
   [:enable-tenants?         :boolean]
   [:session-timeout-seconds [:maybe :int]]])
