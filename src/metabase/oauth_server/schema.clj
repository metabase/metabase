(ns metabase.oauth-server.schema
  "Malli schemas for the oauth-server module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::oauth-access-token
  "A OAuthAccessToken as selected from the app DB: every column of `:oauth_access_token`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:token      :string]
   [:user_id    [:maybe ::lib.schema.id/user]]
   [:client_id  :string]
   [:scope      [:or :keyword :string :map sequential?]]
   [:expiry     :int]
   [:resource   [:maybe [:or :string :map sequential?]]]
   [:revoked_at [:maybe ms/TemporalInstant]]
   [:created_at ms/TemporalInstant]])

(mr/def ::oauth-access-token.update
  "What an update (or insert) of a OAuthAccessToken accepts: every column of `:oauth_access_token` except `id`, all optional."
  [:map {:closed true}
   [:token      {:optional true} [:maybe :string]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:client_id  {:optional true} [:maybe :string]]
   [:scope      {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:expiry     {:optional true} [:maybe :int]]
   [:resource   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:revoked_at {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::oauth-authorization-code
  "A OAuthAuthorizationCode as selected from the app DB: every column of `:oauth_authorization_code`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:code                  :string]
   [:user_id               ::lib.schema.id/user]
   [:client_id             :string]
   [:redirect_uri          [:or :string :map sequential?]]
   [:scope                 [:or :keyword :string :map sequential?]]
   [:nonce                 [:maybe :string]]
   [:expiry                :int]
   [:code_challenge        [:maybe :string]]
   [:code_challenge_method [:maybe [:or :keyword :string]]]
   [:resource              [:maybe [:or :string :map sequential?]]]
   [:created_at            ms/TemporalInstant]])

(mr/def ::oauth-authorization-code.update
  "What an update (or insert) of a OAuthAuthorizationCode accepts: every column of `:oauth_authorization_code` except `id`, all optional."
  [:map {:closed true}
   [:code                  {:optional true} [:maybe :string]]
   [:user_id               {:optional true} [:maybe ::lib.schema.id/user]]
   [:client_id             {:optional true} [:maybe :string]]
   [:redirect_uri          {:optional true} [:maybe [:or :string :map sequential?]]]
   [:scope                 {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:nonce                 {:optional true} [:maybe :string]]
   [:expiry                {:optional true} [:maybe :int]]
   [:code_challenge        {:optional true} [:maybe :string]]
   [:code_challenge_method {:optional true} [:maybe [:or :keyword :string]]]
   [:resource              {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::oauth-client
  "A OAuthClient as selected from the app DB: every column of `:oauth_client`."
  [:map {:closed true}
   [:id                             ms/PositiveInt]
   [:client_id                      :string]
   [:client_secret_hash             [:maybe [:or :string :map sequential?]]]
   [:redirect_uris                  [:or :string :map sequential?]]
   [:grant_types                    [:or :string :map sequential?]]
   [:response_types                 [:or :string :map sequential?]]
   [:scopes                         [:or :string :map sequential?]]
   [:token_endpoint_auth_method     [:maybe [:or :keyword :string]]]
   [:client_name                    [:maybe :string]]
   [:client_uri                     [:maybe [:or :string :map sequential?]]]
   [:logo_uri                       [:maybe [:or :string :map sequential?]]]
   [:contacts                       [:maybe [:or :string :map sequential?]]]
   [:registration_type              [:or :keyword :string]]
   [:client_type                    [:or :keyword :string]]
   [:application_type               [:maybe [:or :keyword :string]]]
   [:registration_access_token_hash [:maybe [:or :string :map sequential?]]]
   [:created_at                     ms/TemporalInstant]
   [:updated_at                     ms/TemporalInstant]])

(mr/def ::oauth-client.update
  "What an update (or insert) of a OAuthClient accepts: every column of `:oauth_client` except `id`, all optional."
  [:map {:closed true}
   [:client_id                      {:optional true} [:maybe :string]]
   [:client_secret_hash             {:optional true} [:maybe [:or :string :map sequential?]]]
   [:redirect_uris                  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:grant_types                    {:optional true} [:maybe [:or :string :map sequential?]]]
   [:response_types                 {:optional true} [:maybe [:or :string :map sequential?]]]
   [:scopes                         {:optional true} [:maybe [:or :string :map sequential?]]]
   [:token_endpoint_auth_method     {:optional true} [:maybe [:or :keyword :string]]]
   [:client_name                    {:optional true} [:maybe :string]]
   [:client_uri                     {:optional true} [:maybe [:or :string :map sequential?]]]
   [:logo_uri                       {:optional true} [:maybe [:or :string :map sequential?]]]
   [:contacts                       {:optional true} [:maybe [:or :string :map sequential?]]]
   [:registration_type              {:optional true} [:maybe [:or :keyword :string]]]
   [:client_type                    {:optional true} [:maybe [:or :keyword :string]]]
   [:application_type               {:optional true} [:maybe [:or :keyword :string]]]
   [:registration_access_token_hash {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at                     {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                     {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::oauth-client-event
  "A OAuthClientEvent as selected from the app DB: every column of `:oauth_client_event`."
  [:map {:closed true}
   [:id              ms/PositiveInt]
   [:oauth_client_id [:maybe ms/PositiveInt]]
   [:user_id         [:maybe ::lib.schema.id/user]]
   [:event_type      [:or :keyword :string]]
   [:created_at      ms/TemporalInstant]])

(mr/def ::oauth-client-event.update
  "What an update (or insert) of a OAuthClientEvent accepts: every column of `:oauth_client_event` except `id`, all optional."
  [:map {:closed true}
   [:oauth_client_id {:optional true} [:maybe ms/PositiveInt]]
   [:user_id         {:optional true} [:maybe ::lib.schema.id/user]]
   [:event_type      {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::oauth-refresh-token
  "A OAuthRefreshToken as selected from the app DB: every column of `:oauth_refresh_token`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:token      :string]
   [:user_id    [:maybe ::lib.schema.id/user]]
   [:client_id  :string]
   [:scope      [:or :keyword :string :map sequential?]]
   [:resource   [:maybe [:or :string :map sequential?]]]
   [:expiry     [:maybe :int]]
   [:revoked_at [:maybe ms/TemporalInstant]]
   [:created_at ms/TemporalInstant]])

(mr/def ::oauth-refresh-token.update
  "What an update (or insert) of a OAuthRefreshToken accepts: every column of `:oauth_refresh_token` except `id`, all optional."
  [:map {:closed true}
   [:token      {:optional true} [:maybe :string]]
   [:user_id    {:optional true} [:maybe ::lib.schema.id/user]]
   [:client_id  {:optional true} [:maybe :string]]
   [:scope      {:optional true} [:maybe [:or :keyword :string :map sequential?]]]
   [:resource   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:expiry     {:optional true} [:maybe :int]]
   [:revoked_at {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]])
