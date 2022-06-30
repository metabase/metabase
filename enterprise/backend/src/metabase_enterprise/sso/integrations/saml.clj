(ns metabase-enterprise.sso.integrations.saml
  "Implementation of the SAML backend for SSO.

  The basic flow of of a SAML login is:

  1. User attempts to access some `url` but is not authenticated

  2. User is redirected to `GET /auth/sso`

  3. Metabase issues another redirect to the identity provider URI

  4. User logs into their identity provider (i.e. Auth0)

  5. Identity provider POSTs to Metabase with successful auth info

  6. Metabase parses/validates the SAML response

  7. Metabase inits the user session, responds with a redirect to back to the original `url`"
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase-enterprise.sso.api.interface :as sso.i]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.api.common :as api]
            [metabase.public-settings :as public-settings]
            [metabase.server.middleware.session :as mw.session]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.sso :as sso-utils]
            [ring.util.codec :as codec]
            [ring.util.response :as response]
            [saml20-clj.core :as saml]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; SAML route supporting functions
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- acs-url []
  (str (public-settings/site-url) "/auth/sso"))

(defn- sp-cert-keystore-details []
  (when-let [path (sso-settings/saml-keystore-path)]
    (when-let [password (sso-settings/saml-keystore-password)]
      (when-let [key-name (sso-settings/saml-keystore-alias)]
        {:filename path
         :password password
         :alias    key-name}))))

(defn- check-saml-enabled []
  (api/check (sso-settings/saml-configured?)
    [400 (tru "SAML has not been enabled and/or configured")]))

(defmethod sso.i/sso-get :saml
  ;; Initial call that will result in a redirect to the IDP along with information about how the IDP can authenticate
  ;; and redirect them back to us
  [req]
  (check-saml-enabled)
  (let [redirect-url (or (get-in req [:params :redirect])
                         (log/warn (trs "Warning: expected `redirect` param, but none is present"))
                         (public-settings/site-url))]
    (sso-utils/check-sso-redirect redirect-url)
    (try
      (let [idp-url      (sso-settings/saml-identity-provider-uri)
            saml-request (saml/request
                           {:request-id (str "id-" (java.util.UUID/randomUUID))
                            :sp-name    (sso-settings/saml-application-name)
                            :issuer     (sso-settings/saml-application-name)
                            :acs-url    (acs-url)
                            :idp-url    idp-url
                            :credential (sp-cert-keystore-details)})
            relay-state  (saml/str->base64 redirect-url)]
        (saml/idp-redirect-response saml-request idp-url relay-state))
    (catch Throwable e
      (let [msg (trs "Error generating SAML request")]
        (log/error e msg)
        (throw (ex-info msg {:status-code 500} e)))))))

(defn- validate-response [response]
  (let [idp-cert (or (sso-settings/saml-identity-provider-certificate)
                     (throw (ex-info (str (tru "Unable to log in: SAML IdP certificate is not set."))
                                     {:status-code 500})))]
    (try
      (saml/validate response idp-cert (sp-cert-keystore-details) {:acs-url (acs-url)
                                                                   :issuer  (sso-settings/saml-identity-provider-issuer)})
      (catch Throwable e
        (log/error e (trs "SAML response validation failed"))
        (throw (ex-info (tru "Unable to log in: SAML response validation failed")
                        {:status-code 401}
                        e))))))

(defn- xml-string->saml-response [xml-string]
  (validate-response (saml/->Response xml-string)))

(defn- unwrap-user-attributes
  "For some reason all of the user attributes coming back from the saml library are wrapped in a list, instead of 'Ryan',
  it's ('Ryan'). This function discards the list if there's just a single item in it."
  [m]
  (m/map-vals (fn [maybe-coll]
                (if (and (coll? maybe-coll)
                         (= 1 (count maybe-coll)))
                  (first maybe-coll)
                  maybe-coll))
              m))

(defn- saml-response->attributes [saml-response]
  (let [assertions (saml/assertions saml-response)
        attrs      (-> assertions first :attrs unwrap-user-attributes)]
    (when-not attrs
      (throw (ex-info (str (tru "Unable to log in: SAML info does not contain user attributes."))
                      {:status-code 401})))
    attrs))

(defn- base64-decode [s]
  (when (u/base64-string? s)
    (codecs/bytes->str (codec/base64-decode s))))

(defmethod sso.i/sso-post :saml
  ;; Does the verification of the IDP's response and 'logs the user in'. The attributes are available in the response:
  ;; `(get-in saml-info [:assertions :attrs])
  [{:keys [params], :as request}]
  (check-saml-enabled)
  (let [continue-url (u/ignore-exceptions
                       (when-let [s (some-> (:RelayState params) base64-decode)]
                         (when-not (str/blank? s)
                           s)))]
    (sso-utils/check-sso-redirect continue-url)
    (let [xml-string    (base64-decode (:SAMLResponse params))
          saml-response (xml-string->saml-response xml-string)
          sso-data      (saml-response->attributes saml-response)
          device-info   (request.u/device-info request)
          sso-settings  {:sso-source          "saml"
                         :group-mappings      (sso-settings/saml-group-mappings)
                         :group-sync          (sso-settings/saml-group-sync)
                         :attribute-email     (sso-settings/saml-attribute-email)
                         :attribute-firstname (sso-settings/saml-attribute-firstname)
                         :attribute-lastname  (sso-settings/saml-attribute-lastname)
                         :attribute-groups    (sso-settings/saml-attribute-groups)
                         :configured?         (sso-settings/saml-configured?)}
          user          (sso-utils/fetch-or-create-user! sso-data sso-settings)
          session       (sso-utils/create-session! :sso user device-info)
          response      (response/redirect (or continue-url (public-settings/site-url)))]
      (mw.session/set-session-cookie request response session))))
