(ns metabase.bigquery-oauth.api
  "API endpoints for per-user Google OAuth authentication against BigQuery.

  Flow:
  1. GET  /api/google-bigquery/authorize  → returns Google OAuth URL; frontend redirects browser there
  2. GET  /api/google-bigquery/callback   → Google redirects here with ?code=&state=; exchanges code for tokens
  3. GET  /api/google-bigquery/status     → returns {:connected bool :email str}
  4. DELETE /api/google-bigquery/connection → revokes and clears stored tokens"
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.bigquery-oauth.settings :as bq-oauth.settings]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [ring.util.response :as response]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ State / CSRF token store ------------------------------------------

;; Simple in-memory store: state-token -> {:user-id int :expires long}
;; Entries are cleaned up on use or after 10 minutes.
(defonce ^:private pending-states (atom {}))

(def ^:private state-ttl-ms (* 10 60 1000))

(defn- new-state-token! [user-id]
  (let [token   (str (UUID/randomUUID))
        expires (+ (System/currentTimeMillis) state-ttl-ms)]
    (swap! pending-states assoc token {:user-id user-id :expires expires})
    token))

(defn- consume-state-token!
  "Returns the user-id associated with `token` and removes it from the store.
  Returns nil if the token is unknown or expired."
  [token]
  (let [{:keys [user-id expires] :as entry} (get @pending-states token)]
    (when entry
      (swap! pending-states dissoc token)
      (when (> expires (System/currentTimeMillis))
        user-id))))

;;; ---------------------------------------------- OAuth helpers -----------------------------------------------

(def ^:private google-auth-url   "https://accounts.google.com/o/oauth2/v2/auth")
(def ^:private google-token-url  "https://oauth2.googleapis.com/token")
(def ^:private google-revoke-url "https://oauth2.googleapis.com/revoke")

(defn- redirect-uri []
  (str (system/site-url) "/api/google-bigquery/callback"))

(defn- build-authorize-url [state]
  (let [params {"client_id"     (bq-oauth.settings/google-bigquery-oauth-client-id)
                "redirect_uri"  (redirect-uri)
                "response_type" "code"
                "scope"         "https://www.googleapis.com/auth/bigquery https://www.googleapis.com/auth/drive.readonly openid email"
                "access_type"   "offline"
                "prompt"        "consent"
                "state"         state}
        query  (str/join "&" (map (fn [[k v]] (str k "=" (java.net.URLEncoder/encode v "UTF-8"))) params))]
    (str google-auth-url "?" query)))

(defn- exchange-code-for-tokens!
  "POSTs the authorization code to Google and returns {:access_token :refresh_token :expires_in :email}."
  [code]
  (let [resp (http/post google-token-url
                        {:form-params  {"code"          code
                                        "client_id"     (bq-oauth.settings/google-bigquery-oauth-client-id)
                                        "client_secret" (bq-oauth.settings/google-bigquery-oauth-client-secret)
                                        "redirect_uri"  (redirect-uri)
                                        "grant_type"    "authorization_code"}
                         :as :json})]
    (:body resp)))

(defn refresh-access-token!
  "Uses the stored refresh token to obtain a new access token.
  Updates the user record and returns the new access token string, or nil on failure."
  [user-id refresh-token]
  (try
    (let [resp   (http/post google-token-url
                            {:form-params  {"client_id"     (bq-oauth.settings/google-bigquery-oauth-client-id)
                                            "client_secret" (bq-oauth.settings/google-bigquery-oauth-client-secret)
                                            "refresh_token" refresh-token
                                            "grant_type"    "refresh_token"}
                             :as :json})
          body   (:body resp)
          token  (:access_token body)
          expiry (+ (System/currentTimeMillis) (* (:expires_in body 3600) 1000))]
      (t2/update! :model/User user-id
                  {:google_oauth_access_token token
                   :google_oauth_token_expiry expiry})
      token)
    (catch Exception e
      (log/warnf e "Failed to refresh Google OAuth token for user %d; clearing tokens" user-id)
      (t2/update! :model/User user-id
                  {:google_oauth_access_token  nil
                   :google_oauth_refresh_token nil
                   :google_oauth_token_expiry  nil})
      nil)))

(defn get-valid-access-token
  "Returns a valid access token for `user` (a User map with at least :id), refreshing if expired.
  Queries the DB directly for token fields since they are not in the default user columns.
  Returns nil if the user has no connected Google account or refresh fails."
  [user]
  (when-let [user-id (:id user)]
    (let [{:keys [google_oauth_access_token google_oauth_refresh_token google_oauth_token_expiry]}
          (t2/select-one [:model/User :google_oauth_access_token :google_oauth_refresh_token :google_oauth_token_expiry]
                         :id user-id)]
      (when (and google_oauth_access_token google_oauth_refresh_token)
        (let [expired? (or (nil? google_oauth_token_expiry)
                           ;; treat as expired 60 seconds early to avoid edge cases
                           (< google_oauth_token_expiry (+ (System/currentTimeMillis) 60000)))]
          (if expired?
            (refresh-access-token! user-id google_oauth_refresh_token)
            google_oauth_access_token))))))

;;; --------------------------------------------- API endpoints ------------------------------------------------

(api.macros/defendpoint :get "/authorize"
  "Returns a Google OAuth authorization URL. The frontend should redirect the browser to this URL."
  [_route-params _query-params _body]
  :- [:map [:url :string]]
  (let [client-id (bq-oauth.settings/google-bigquery-oauth-client-id)]
    (api/check (seq client-id)
               [503 (tru "Google BigQuery OAuth is not configured. Ask your admin to set the client ID and secret.")])
    {:url (build-authorize-url (new-state-token! api/*current-user-id*))}))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/callback"
  "OAuth callback from Google. Exchanges the authorization code for tokens and stores them encrypted."
  [_route-params
   {:keys [code state error]} :- [:map
                                  [:code  {:optional true} [:maybe :string]]
                                  [:state {:optional true} [:maybe :string]]
                                  [:error {:optional true} [:maybe :string]]]
   _body
   _request]
  (when error
    (log/warnf "Google OAuth callback received error: %s" error)
    (api/check false [400 (tru "Google OAuth authorization was denied or failed: {0}" error)]))
  (api/check (and (seq code) (seq state))
             [400 (tru "Missing code or state parameter.")])
  (let [state-user-id (consume-state-token! state)]
    (api/check state-user-id
               [400 (tru "Invalid or expired OAuth state token.")])
    (api/check (= state-user-id api/*current-user-id*)
               [403 (tru "OAuth state user mismatch.")])
    (let [tokens (exchange-code-for-tokens! code)
          expiry (+ (System/currentTimeMillis) (* (:expires_in tokens 3600) 1000))]
      (t2/update! :model/User api/*current-user-id*
                  {:google_oauth_access_token  (:access_token tokens)
                   :google_oauth_refresh_token (:refresh_token tokens)
                   :google_oauth_token_expiry  expiry})
      (log/infof "Stored Google OAuth tokens for user %d" api/*current-user-id*)))
  ;; Redirect back to Metabase home after successful connection
  (response/redirect "/"))

(api.macros/defendpoint :get "/status"
  "Returns the current user's Google OAuth connection status."
  [_route-params _query-params _body]
  :- [:map
      [:connected :boolean]
      [:email {:optional true} [:maybe :string]]]
  (let [user (t2/select-one [:model/User :google_oauth_access_token :google_oauth_refresh_token :email]
                            :id api/*current-user-id*)]
    {:connected (boolean (and (:google_oauth_access_token user)
                              (:google_oauth_refresh_token user)))
     :email     (:email user)}))

(api.macros/defendpoint :delete "/connection"
  "Disconnects the current user's Google OAuth account, clearing stored tokens."
  [_route-params _query-params _body]
  :- [:map [:status [:= 204]] [:body :nil]]
  (let [{:keys [google_oauth_access_token]} (t2/select-one [:model/User :google_oauth_access_token]
                                                            :id api/*current-user-id*)]
    (when (seq google_oauth_access_token)
      (try
        (http/post google-revoke-url {:query-params {"token" google_oauth_access_token}})
        (catch Exception e
          (log/warnf e "Failed to revoke Google OAuth token for user %d" api/*current-user-id*)))))
  (t2/update! :model/User api/*current-user-id*
              {:google_oauth_access_token  nil
               :google_oauth_refresh_token nil
               :google_oauth_token_expiry  nil})
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "/api/google-bigquery routes."
  (api.macros/ns-handler *ns*))
