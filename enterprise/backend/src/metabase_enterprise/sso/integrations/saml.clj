(ns metabase-enterprise.sso.integrations.saml
  "Implementation of the SAML backend for SSO.

  # The basic flow of of a SAML login is:

  1. User attempts to access some `url` but is not authenticated.

  2. User is redirected to `GET /auth/sso`.

  3. Metabase issues another redirect to the identity provider URI.

  4. User logs into their identity provider (i.e. Auth0).

  5. Identity provider POSTs to Metabase with successful auth info.

  6. Metabase parses/validates the SAML response.

  7. Metabase inits the user session, responds with a redirect to back to the original `url`.

  # The basic flow of a SAML logout is:

  1. A SSO SAML User clicks Sign Out.

  2. Metabase issues a redirect to the client with a LogoutRequest to the identity provider.

  3. Client forwards the request to the identity provider.

  4. Identity provider logs the user out + redirects client back to Metabase with a LogoutResponse.

  5. Metabase checks for successful LogoutResponse, clears the user's session, and responds to the client with a redirect to the home page."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.saml-utils :as saml-utils]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.integrations.token-utils :as token-utils]
   [metabase-enterprise.sso.models.relay-state :as relay-state]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.embedding.util :as embed.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [ring.util.response :as response]
   [saml20-clj.core :as saml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; SAML route supporting functions
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- acs-url []
  (str (system/site-url) "/auth/sso"))

(defn sp-cert-keystore-details
  "Build a certificate store map usable by the saml20-clj library."
  []
  (when-let [path (sso-settings/saml-keystore-path)]
    (when-let [password (sso-settings/saml-keystore-password)]
      (when-let [key-name (sso-settings/saml-keystore-alias)]
        {:filename path
         :password password
         :alias    key-name}))))

(defn- check-saml-enabled []
  (api/check (sso-settings/saml-enabled)
             [400 (tru "SAML has not been enabled and/or configured")]))

(defn- continue-url
  "Where the user should end up after a successful login. For modular embedding this is the popup fallback
   URL (used only when there is no opener window). Otherwise it comes from the `redirect` query param:
   resolved against the site URL when relative, used as-is when absolute, or falling back to the site URL
   (with a warning) when no `redirect` was provided."
  [req embedding?]
  (let [redirect (get-in req [:params :redirect])]
    (cond
      embedding?                        (acs-url)
      (nil? redirect)                   (do
                                          (log/warn "Warning: expected `redirect` param, but none is present")
                                          (system/site-url))
      (sso-utils/relative-uri? redirect) (str (system/site-url) redirect)
      :else                             redirect)))

(defmethod sso.i/sso-get :saml
  ;; Initial call that will result in a redirect to the IDP along with information about how the IDP can authenticate
  ;; and redirect them back to us
  [req]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  (let [redirect   (get-in req [:params :redirect])
        embedding? (embed.util/is-modular-embedding-request? req)
        continue   (continue-url req embedding?)
        ;; Generate the RelayState key up front (the AuthnRequest embeds it) but DON'T persist it yet — we
        ;; only store the callback context once the AuthnRequest is successfully generated.
        relay-key  (relay-state/generate-key)]
    ;; Validate the requested redirect before persisting it as the stored continue URL
    (sso-utils/check-sso-redirect redirect)
    ;; Use provider/authenticate to generate SAML AuthnRequest
    (let [auth-result (auth-identity/authenticate :provider/saml
                                                  (assoc req
                                                         :redirect-url continue
                                                         :relay-state relay-key))]
      (cond
        ;; Need redirect to IdP
        (= :redirect (:success? auth-result))
        (do
          (relay-state/persist! {:id           relay-key
                                 :continue-url continue
                                 :origin       (when embedding? (get-in req [:headers "origin"]))
                                 :embedding?   embedding?})
          (if embedding?
            {:status 200
             :body {:url (:redirect-url auth-result)
                    :method "saml"}
             :headers {"Content-Type" "application/json"}}
            (response/redirect (:redirect-url auth-result))))

        ;; Error
        :else
        (throw (ex-info (or (:message auth-result) (trs "SAML request generation failed"))
                        {:status-code 500}))))))

(defn- legacy-token-relay-state
  "Backwards compatibility: before the RelayState was stored server-side, the embedding flow Base64-encoded
   a continue URL that carried `?token=<encrypted token>&origin=<origin>`. Logins started on an older version
   may POST back to a newer one during an upgrade, so we still honor that format here. Returns an `:embedding`
   (or `:expired`) result, mirroring [[process-relay-state]], or `nil` if `continue-url` carries no token."
  [continue-url]
  (when-let [token-value (and continue-url (second (re-find #"[?&]token=([^&]+)" continue-url)))]
    (let [url-without-token  (str/replace continue-url #"[?&]token=[^&]+(&|$)" "$1")
          origin-param       (second (re-find #"[?&]origin=([^&]+)" url-without-token))
          origin             (if origin-param
                               (try
                                 (java.net.URLDecoder/decode ^String origin-param "UTF-8")
                                 (catch Exception _
                                   "*"))
                               "*")
          clean-continue-url (if origin-param
                               (str/replace url-without-token #"[?&]origin=[^&]+(&|$)" "$1")
                               url-without-token)]
      (if (token-utils/validate-token token-value)
        {:mode :embedding, :continue-url clean-continue-url, :origin origin}
        {:mode :expired}))))

(defn- process-relay-state
  "Resolve the RelayState returned by the IdP into the continue URL and (for embedding) the popup origin.

   Returns a map with a `:mode`:
   - `:embedding` - a modular-embedding popup login; `:continue-url` and `:origin` describe the callback.
   - `:redirect`  - a regular login; redirect to `:continue-url` with a session cookie.
   - `:expired`   - the login's proof (stored entry or legacy token) is missing, expired, or invalid."
  [relay-state]
  (cond
    (relay-state/relay-state-key? relay-state)
    (if-let [{:keys [continue_url origin embedding]} (relay-state/find-unexpired relay-state)]
      (if embedding
        {:mode :embedding, :continue-url continue_url, :origin (or origin "*"), :relay-key relay-state}
        {:mode :redirect,  :continue-url continue_url, :relay-key relay-state})
      {:mode :expired})

    :else
    (let [continue-url (u/ignore-exceptions
                         (when-let [s (some-> relay-state u/decode-base64)]
                           (when-not (str/blank? s)
                             s)))]
      (or (legacy-token-relay-state continue-url)
          {:mode :redirect, :continue-url continue-url}))))

(defmethod sso.i/sso-post :saml
  ;; Does the verification of the IDP's response and 'logs the user in'. The attributes are available in the response:
  ;; `(get-in saml-info [:assertions :attrs])
  [{:keys [params], :as request}]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  ;; Resolve the RelayState into a continue URL (and popup origin for embedding)
  (let [{:keys [mode continue-url origin relay-key]} (process-relay-state (:RelayState params))]
    ;; A login whose RelayState entry is gone (expired, already used, or an invalid legacy token) can't be trusted
    (when (= mode :expired)
      (throw (ex-info (tru "Invalid authentication token")
                      {:status-code 401})))
    (sso-utils/check-sso-redirect continue-url)
    (try
      (let [redirect-url (or continue-url (system/site-url))
            login-result (auth-identity/login! :provider/saml
                                               (assoc request
                                                      :redirect-url redirect-url
                                                      :device-info (request/device-info request)))]
        (cond
          ;; Login succeeded
          (:success? login-result)
          (do
            ;; Consume the single-use key only now that login succeeded — a failed or retried callback keeps
            ;; the key alive so the user can complete login. (Legacy Base64 logins have no `:relay-key`.)
            (when relay-key (relay-state/delete! relay-key))
            (if (= mode :embedding)
              (saml-utils/create-token-response (:session login-result) origin continue-url (:nonce request))
              (request/set-session-cookies request
                                           (response/redirect (:redirect-url login-result))
                                           (:session login-result)
                                           (t/zoned-date-time (t/zone-id "GMT")))))

          ;; Login failed
          :else
          (throw (ex-info (or (str (:message login-result)) "SAML authentication failed")
                          {:status-code 401}))))
      (catch Throwable e
        (log/error e "SAML response validation failed")
        (throw (ex-info (tru "Unable to log in: SAML response validation failed")
                        {:status-code 401}
                        e))))))

(defmethod sso.i/sso-handle-slo :saml
  [{:keys [cookies] :as req}]
  (if (sso-settings/saml-slo-enabled)
    (let [idp-cert (or (sso-settings/saml-identity-provider-certificate)
                       (throw (ex-info (str (tru "Unable to handle logout: SAML IdP certificate is not set."))
                                       {:status-code 500})))
          response (saml/validate-logout req
                                         {:idp-cert idp-cert
                                          :issuer (sso-settings/saml-identity-provider-issuer)
                                          :response-validators [:signature :require-authenticated :issuer]})]
      (if-let [metabase-session-key (and (saml/logout-success? response) (get-in cookies [request/metabase-session-cookie :value]))]
        (do
          (t2/delete! :model/Session {:where [:or [:= (session/hash-session-key metabase-session-key) :key_hashed] [:= metabase-session-key :id]]})
          (request/clear-session-cookie (response/redirect (system/site-url))))
        {:status 500 :body "SAML logout failed."}))
    (log/warn "SAML SLO is not enabled, not continuing Single Log Out flow.")))
