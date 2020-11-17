(ns metabase-enterprise.sso.integrations.saml
  "Implementation of the SAML backend for SSO"
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase-enterprise.sso.api.sso :as sso]
            [metabase-enterprise.sso.integrations
             [sso-settings :as sso-settings]
             [sso-utils :as sso-utils]]
            [metabase.api
             [common :as api]
             [session :as session]]
            [metabase.integrations.common :as integrations.common]
            [metabase.middleware.session :as mw.session]
            [metabase.util.i18n :refer [trs tru]]
            [ring.util
             [codec :as codec]
             [response :as resp]]
            [saml20-clj.core :as saml]
            [schema.core :as s])
  (:import java.util.UUID))

(defn- group-names->ids [group-names]
  (->> (cond-> group-names (string? group-names) vector)
       (map keyword)
       (mapcat (sso-settings/saml-group-mappings))
       set))

(defn- sync-groups! [user group-names]
  (when (sso-settings/saml-group-sync)
    (when group-names
      (integrations.common/sync-group-memberships! user (group-names->ids group-names)))))

(s/defn saml-auth-fetch-or-create-user! :- (s/maybe {:id UUID, s/Keyword s/Any})
  "Returns a Session for the given `email`. Will create the user if needed."
  [first-name last-name email group-names user-attributes]
  (when-not (sso-settings/saml-configured?)
    (throw (IllegalArgumentException. "Can't create new SAML user when SAML is not configured")))
  (when-not email
    (throw (ex-info (str (tru "Invalid SAML configuration: could not find user email.")
                         " "
                         (tru "We tried looking for {0}, but couldn't find the attribute."
                              (sso-settings/saml-attribute-email))
                         " "
                         (tru "Please make sure your SAML IdP is properly configured."))
             {:status-code 400, :user-attributes (keys user-attributes)})))
  (when-let [user (or (sso-utils/fetch-and-update-login-attributes! email user-attributes)
                      (sso-utils/create-new-sso-user! {:first_name       first-name
                                                       :last_name        last-name
                                                       :email            email
                                                       :sso_source       "saml"
                                                       :login_attributes user-attributes}))]
    (sync-groups! user group-names)
    (session/create-session! :sso user)))


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

(defmethod sso/sso-get :saml
  ;; Initial call that will result in a redirect to the IDP along with information about how the IDP can authenticate
  ;; and redirect them back to us
  [req]
  (check-saml-enabled)
  (try
    (let [redirect-url (or (get-in req [:params :redirect])
                           (log/warn (trs "Warning: expected `redirect` param, but none is present"))
                           (public-settings/site-url))
          idp-url      (sso-settings/saml-identity-provider-uri)
          saml-request (saml/request
                        {:request-id (str "id-" (java.util.UUID/randomUUID))
                         :sp-name    (sso-settings/saml-application-name)
                         :issuer     (sso-settings/saml-application-name)
                         :acs-url    (acs-url)
                         :idp-url    idp-url
                         :credential (sp-cert-keystore-details)})
          ;; encode the redirect URL to base-64 if it's not already encoded.
          relay-state  (cond-> redirect-url
                         (not (u/base64-string? redirect-url)) saml/str->base64)]
      (saml/idp-redirect-response saml-request idp-url relay-state))
    (catch Throwable e
      (let [msg (trs "Error generating SAML request")]
        (log/error e msg)
        (throw (ex-info msg {:status-code 500} e))))))

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
  (codecs/bytes->str (codec/base64-decode s)))

(defmethod sso/sso-post :saml
  ;; Does the verification of the IDP's response and 'logs the user in'. The attributes are available in the response:
  ;; `(get-in saml-info [:assertions :attrs])
  [{:keys [params], :as request}]
  (check-saml-enabled)
  (let [continue-url  (u/ignore-exceptions
                        (when-let [s (some-> (:RelayState params) base64-decode)]
                          (when-not (str/blank? s)
                            s)))
        xml-string    (base64-decode (:SAMLResponse params))
        saml-response (xml-string->saml-response xml-string)
        attrs         (saml-response->attributes saml-response)
        email         (get attrs (sso-settings/saml-attribute-email))
        first-name    (get attrs (sso-settings/saml-attribute-firstname) "Unknown")
        last-name     (get attrs (sso-settings/saml-attribute-lastname) "Unknown")
        groups        (get attrs (sso-settings/saml-attribute-group))
        session       (saml-auth-fetch-or-create-user! first-name last-name email groups attrs)
        response      (resp/redirect (or continue-url (public-settings/site-url)))]
    (mw.session/set-session-cookie request response session)))
