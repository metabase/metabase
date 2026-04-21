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

(defn construct-redirect-url
  "Constructs a redirect URL from request parameters.
   Parameters:
   - req: The request object containing params, headers, etc.
   Returns: The constructed redirect URL with appropriate query parameters"
  [req]
  (let [redirect (get-in req [:params :redirect])
        origin (get-in req [:headers "origin"])
        embedding-sdk-header? (embed.util/is-modular-embedding-request? req)]

    (cond
      ;; Case 1: Embedding SDK header is present - use ACS URL with token and origin
      embedding-sdk-header?
      (str (acs-url) "?token=" (token-utils/generate-token) "&origin=" (java.net.URLEncoder/encode ^String origin "UTF-8"))

      ;; Case 2: No redirect parameter
      (nil? redirect)
      (do
        (log/warn "Warning: expected `redirect` param, but none is present")
        (system/site-url))

      ;; Case 3: Redirect is a relative URI
      (sso-utils/relative-uri? redirect)
      (str (system/site-url) redirect)

      ;; Case 4: Redirect is an absolute URI
      :else
      redirect)))

(defmethod sso.i/sso-get :saml
  ;; Initial call that will result in a redirect to the IDP along with information about how the IDP can authenticate
  ;; and redirect them back to us
  [req]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  (let [redirect (get-in req [:params :redirect])
        embedding-sdk-header? (embed.util/is-modular-embedding-request? req)
        redirect-url (construct-redirect-url req)]
    (sso-utils/check-sso-redirect redirect)
    ;; Use provider/authenticate to generate SAML AuthnRequest
    (let [auth-result (auth-identity/authenticate :provider/saml
                                                  (assoc req :redirect-url redirect-url))]
      (cond
        ;; Need redirect to IdP
        (= :redirect (:success? auth-result))
        (if embedding-sdk-header?
          {:status 200
           :body {:url (:redirect-url auth-result)
                  :method "saml"}
           :headers {"Content-Type" "application/json"}}
          (response/redirect (:redirect-url auth-result)))

        ;; Error
        :else
        (throw (ex-info (or (:message auth-result) (trs "SAML request generation failed"))
                        {:status-code 500}))))))

(defn- process-relay-state-params
  "Process the RelayState to extract continue URL and related parameters"
  [relay-state]
  (let [continue-url (u/ignore-exceptions
                       (when-let [s (some-> relay-state u/decode-base64)]
                         (when-not (str/blank? s)
                           s)))
        ;; Extract token value from URL parameter
        token-value (when continue-url
                      (second (re-find #"[?&]token=([^&]+)" continue-url)))
        ;; Check if token is valid using token-utils
        token-valid? (when token-value
                       (token-utils/validate-token token-value))
        ;; Remove token parameter
        url-without-token (when continue-url
                            (str/replace continue-url #"[?&]token=[^&]+(&|$)" "$1"))
        ;; Extract origin parameter
        origin-param (when url-without-token
                       (second (re-find #"[?&]origin=([^&]+)" url-without-token)))
        origin (if origin-param
                 (try
                   (java.net.URLDecoder/decode ^String origin-param "UTF-8")
                   (catch Exception _
                     "*"))
                 "*")
        ;; Remove origin parameter
        clean-continue-url (if (and url-without-token origin-param)
                             (str/replace url-without-token #"[?&]origin=[^&]+(&|$)" "$1")
                             url-without-token)]
    {:continue-url continue-url
     :token-value token-value
     :token-valid? token-valid?
     :clean-continue-url clean-continue-url
     :origin origin}))

(defmethod sso.i/sso-post :saml
  ;; Does the verification of the IDP's response and 'logs the user in'. The attributes are available in the response:
  ;; `(get-in saml-info [:assertions :attrs])
  [{:keys [params], :as request}]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  ;; Process continue URL and extract needed parameters
  (let [{:keys [continue-url token-value token-valid? clean-continue-url origin]} (process-relay-state-params (:RelayState params))]
    ;; Check if token is present but not valid
    (when (and token-value (not token-valid?))
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
          (if token-value
            (saml-utils/create-token-response (:session login-result) origin clean-continue-url)
            (request/set-session-cookies request
                                         (response/redirect (:redirect-url login-result))
                                         (:session login-result)
                                         (t/zoned-date-time (t/zone-id "GMT"))))

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
