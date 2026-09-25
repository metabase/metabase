(ns metabase.mcp-client.connections
  "Admin-registered external MCP servers (`:model/McpServer`) and each user's connection to them
  (`:model/McpConnection`): starting and finishing OAuth, storing tokens, and producing a client that talks to a
  server as a given user."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.mcp-client.client :as client]
   [metabase.mcp-client.db :as mcp-client.db]
   [metabase.mcp-client.oauth :as oauth]
   [metabase.mcp-client.settings :as mcp-client.settings]
   [metabase.system.core :as system]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private network-policies #{:external-only :allow-private :allow-all})

(defn- network-policy
  []
  (let [policy (mcp-client.settings/mcp-client-allowed-networks)]
    (if (contains? network-policies policy) policy :external-only)))

(defn server-client
  "A client for `server` whose requests carry `headers` (a map, a 0-arity fn, or nil)."
  [server headers]
  (client/client {:url            (:url server)
                  :headers        (or headers {})
                  :network-policy (network-policy)}))

(defn redirect-uri
  "Where authorization servers send the browser back to."
  []
  (str (system/site-url) "/api/mcp-client/oauth/callback"))

(defn- upsert-connection!
  [server-id user-id values]
  (if-let [existing (mcp-client.db/user-connection server-id user-id)]
    (do (mcp-client.db/update-connection! (:id existing) values)
        (mcp-client.db/connection (:id existing)))
    (mcp-client.db/insert-connection! (merge {:mcp_server_id server-id :user_id user-id} values))))

(def ^:private cleared-connection
  {:access_token  nil
   :refresh_token nil
   :expires_at    nil
   :scopes        nil
   :account       nil
   :error         nil
   :oauth_state   nil
   :oauth_pending nil})

;;; --------------------------------------------------- OAuth ---------------------------------------------------

(defn- oauth-client!
  "The server's OAuth client registration for `authorization-server`. A registration is only good for the issuer and
  redirect URI it was made with, so a new one is made (and stored) when either changed."
  [server authorization-server resource]
  (let [redirect (redirect-uri)
        issuer   (:issuer authorization-server)
        existing (:oauth_client server)]
    (if (and existing (= issuer (:issuer existing)) (= redirect (:redirect_uri existing)))
      existing
      (let [registration (oauth/register-client! (server-client server nil) authorization-server {:redirect-uris [redirect]})
            oauth-client {:issuer                                         issuer
                          :redirect_uri                                   redirect
                          :resource                                       resource
                          :token_endpoint                                 (:token_endpoint authorization-server)
                          :authorization_response_iss_parameter_supported (:authorization_response_iss_parameter_supported authorization-server)
                          :registration                                   registration}]
        (mcp-client.db/update-server! (:id server) {:oauth_client oauth-client} false)
        oauth-client))))

(defn- start-oauth!
  [server user-id]
  (let [{:keys [authorization-server resource scopes]}
        (or (oauth/discover (server-client server nil))
            (throw (ex-info (tru "{0} does not ask for authorization; choose another authentication strategy for it" (:name server))
                            {:status-code 400})))
        oauth-client          (oauth-client! server authorization-server resource)
        {:keys [url pending]} (oauth/authorization-request authorization-server
                                                           {:client-id    (get-in oauth-client [:registration :client_id])
                                                            :redirect-uri (:redirect_uri oauth-client)
                                                            :scopes       scopes
                                                            :resource     resource})]
    {:redirect_url url
     :connection   (upsert-connection! (:id server) user-id
                                       (merge cleared-connection {:status        :pending
                                                                  :scopes        scopes
                                                                  :oauth_state   (:state pending)
                                                                  :oauth_pending pending}))}))

(defn connect!
  "Start connecting `user-id` to `server`. For OAuth servers the answer carries the `:redirect_url` to send the
  browser to and a pending connection; other strategies connect on the spot."
  [server user-id]
  (case (:auth_strategy server)
    :oauth           (start-oauth! server user-id)
    (:header :none)  {:redirect_url nil
                      :connection   (upsert-connection! (:id server) user-id (assoc cleared-connection :status :connected))}))

(defn- ->offset-date-time
  [instant]
  (some-> instant (t/zoned-date-time (t/zone-id "UTC")) t/offset-date-time))

(def ^:private secret-token-keys
  [:access_token :refresh_token :expires_in :expires-at :token_type :scope :resource :id_token])

(defn- token-fields
  "Connection columns for a token response: the tokens themselves, and whatever else the server said about the
  account (Notion, for one, names the workspace) for people to recognize the connection by."
  [tokens]
  {:access_token  (:access_token tokens)
   :refresh_token (:refresh_token tokens)
   :expires_at    (->offset-date-time (:expires-at tokens))
   :account       (not-empty (apply dissoc tokens secret-token-keys))})

(defn- authorization-server
  [{:keys [oauth_client]}]
  (select-keys oauth_client [:issuer :token_endpoint :authorization_response_iss_parameter_supported]))

(defn complete-oauth!
  "Finish the OAuth flow the browser came back from with `params` (`state`, `code`, `iss`, or `error`): find the
  pending connection by state, make sure it is `user-id`'s, exchange the code, and store the tokens. Returns the
  connection; a failure is recorded on it before being rethrown."
  [user-id {:keys [state] :as params}]
  (let [connection (or (when-not (str/blank? state)
                         (mcp-client.db/pending-connection state))
                       (throw (ex-info (tru "No authorization is waiting for this response") {:status-code 404})))]
    (when-not (= user-id (:user_id connection))
      (throw (ex-info (tru "This authorization was started by a different user") {:status-code 403})))
    (let [server (mcp-client.db/server (:mcp_server_id connection))]
      (try
        (let [tokens (oauth/exchange-code! (server-client server nil)
                                           (authorization-server server)
                                           (get-in server [:oauth_client :registration])
                                           (:oauth_pending connection)
                                           params)]
          (mcp-client.db/update-connection! (:id connection)
                                            (merge (token-fields tokens)
                                                   {:status        :connected
                                                    :error         nil
                                                    :oauth_state   nil
                                                    :oauth_pending nil}
                                                   (when-let [scope (:scope tokens)]
                                                     {:scopes (str/split scope #"\s+")}))))
        (catch Exception e
          (mcp-client.db/update-connection! (:id connection)
                                            {:status :error :error (ex-message e) :oauth_state nil :oauth_pending nil})
          (throw e)))
      (mcp-client.db/connection (:id connection)))))

(defn- expiring?
  [expires-at]
  (and expires-at
       (t/before? (t/instant expires-at) (t/plus (t/instant) (t/seconds 60)))))

(defn- oauth-headers
  "A headers fn that sends the connection's access token, refreshing and storing a new one when it is about to
  expire."
  [server connection]
  (let [current (atom connection)]
    (fn []
      (locking current
        (let [{:keys [refresh_token expires_at]} @current]
          (when (and refresh_token (expiring? expires_at))
            (let [tokens (oauth/refresh! (server-client server nil)
                                         (authorization-server server)
                                         (get-in server [:oauth_client :registration])
                                         {:refresh_token refresh_token
                                          :resource      (get-in server [:oauth_client :resource])})
                  fields (select-keys (token-fields tokens) [:access_token :refresh_token :expires_at])]
              (mcp-client.db/update-connection! (:id connection) (assoc fields :error nil))
              (swap! current merge fields))))
        {"Authorization" (str "Bearer " (:access_token @current))}))))

(defn- credential-headers
  [{:keys [credentials]}]
  (let [{:keys [header_name header_value]} credentials]
    (when (and header_name header_value)
      {header_name header_value})))

(defn connection-client
  "A client that talks to `server` as the owner of `connection`."
  [server connection]
  (case (:auth_strategy server)
    :oauth  (do (when-not (= :connected (:status connection))
                  (throw (ex-info (tru "You are not connected to {0}" (:name server)) {:status-code 400})))
                (server-client server (oauth-headers server connection)))
    :header (server-client server (credential-headers server))
    :none   (server-client server nil)))

(defn disconnect!
  "Forget `user-id`'s connection to server `server-id`."
  [server-id user-id]
  (mcp-client.db/delete-connection! server-id user-id))
