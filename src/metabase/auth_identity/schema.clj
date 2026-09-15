(ns metabase.auth-identity.schema
  "Malli schemas for the auth-identity module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::auth-identity.credentials.password
  "Credentials of the `password` provider."
  [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:10"}
   [:plaintext_password {:optional true} [:maybe :string]]
   [:password_hash      {:optional true} [:maybe :string]]
   [:password_salt      {:optional true} [:maybe :string]]])

(mr/def ::auth-identity.credentials.token
  "Credentials of a hashed-token provider (password reset, support access grant)."
  [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:17"}
   [:token_hash    {:optional true} [:maybe :string]]
   [:expires_at    {:optional true} [:maybe ms/TemporalInstant]]
   [:consumed_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:grant_ends_at {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::auth-identity.credentials.totp
  "Credentials of the `totp` (MFA) provider."
  [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:25"}
   [:secret          {:optional true} :string]
   [:last_used_step  {:optional true} :int]
   [:used_jtis       {:optional true} [:sequential [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:28"}
                                                    [:jti :string]
                                                    [:exp :int]]]]
   [:recovery_codes  {:optional true} [:sequential :string]]
   [:email_otp       {:optional true} [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:32"}
                                       [:hash :string]
                                       [:exp  :int]]]])

(mr/def ::auth-identity.credentials
  "The `:credentials` column of a AuthIdentity, decoded."
  [:or ::auth-identity.credentials.password ::auth-identity.credentials.token ::auth-identity.credentials.totp])

(mr/def ::auth-identity.metadata.emailed-secret
  "Metadata of an emailed-secret token."
  [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:42"}
   [:email           {:optional true} [:maybe ms/Email]]
   [:ip_address      {:optional true} [:maybe :string]]
   [:request_context {:optional true} [:maybe [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:45"}
                                               [:user_agent {:optional true} [:maybe :string]]
                                               [:timestamp  {:optional true} [:maybe [:or ms/TemporalInstant :string]]]]]]])

(mr/def ::auth-identity.metadata.slack-connect
  "Metadata of the `slack-connect` provider."
  [:map {:closed true, :probe/id "src/metabase/auth_identity/schema.clj:51"}
   [:signing_secret_version {:optional true} [:maybe :int]]])

(mr/def ::auth-identity.metadata
  "The `:metadata` column of a AuthIdentity, decoded."
  [:or ::auth-identity.metadata.emailed-secret ::auth-identity.metadata.slack-connect])

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
