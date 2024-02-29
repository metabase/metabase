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
   [buddy.core.codecs :as codecs]
   [clojure.data.xml :as xml]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.api.common :as api]
   [metabase.api.session :as api.session]
   [metabase.integrations.common :as integrations.common]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.request.util :as request.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.urls :as urls]
   [ring.util.response :as response]
   [saml20-clj.core :as saml]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.net URI URISyntaxException)
   (java.util Base64 UUID)))

(set! *warn-on-reflection* true)

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names]
  (->> (cond-> group-names (string? group-names) vector)
       (map keyword)
       (mapcat (sso-settings/saml-group-mappings))
       set))

(defn- all-mapped-group-ids
  "Returns the set of all MB group IDs that have configured mappings"
  []
  (-> (sso-settings/saml-group-mappings)
      vals
      flatten
      set))

(defn- sync-groups!
  "Sync a user's groups based on mappings configured in the SAML settings"
  [user group-names]
  (when (sso-settings/saml-group-sync)
    (when group-names
      (integrations.common/sync-group-memberships! user
                                                   (group-names->ids group-names)
                                                   (all-mapped-group-ids)))))

(s/defn ^:private fetch-or-create-user! :- (s/maybe {:id UUID, s/Keyword s/Any})
  "Returns a Session for the given `email`. Will create the user if needed."
  [{:keys [first-name last-name email group-names user-attributes device-info]}]
  (when-not (sso-settings/saml-enabled)
    (throw (IllegalArgumentException. (tru "Can't create new SAML user when SAML is not enabled"))))
  (when-not email
    (throw (ex-info (str (tru "Invalid SAML configuration: could not find user email.")
                         " "
                         (tru "We tried looking for {0}, but couldn't find the attribute."
                              (sso-settings/saml-attribute-email))
                         " "
                         (tru "Please make sure your SAML IdP is properly configured."))
                    {:status-code 400, :user-attributes (keys user-attributes)})))
  (let [new-user {:first_name       first-name
                  :last_name        last-name
                  :email            email
                  :sso_source       :saml
                  :login_attributes user-attributes}]
    (when-let [user (or (sso-utils/fetch-and-update-login-attributes! new-user)
                        (sso-utils/check-user-provisioning :saml)
                        (sso-utils/create-new-sso-user! new-user))]
      (sync-groups! user group-names)
      (api.session/create-session! :sso user device-info))))

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
  (api/check (sso-settings/saml-enabled)
    [400 (tru "SAML has not been enabled and/or configured")]))

(defn- has-host? [uri]
  (try
    (-> uri URI. .getHost some?)
    (catch URISyntaxException _ false)))

(defmethod sso.i/sso-get :saml
  ;; Initial call that will result in a redirect to the IDP along with information about how the IDP can authenticate
  ;; and redirect them back to us
  [req]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  (let [redirect (get-in req [:params :redirect])
        redirect-url (if (nil? redirect)
                       (do
                         (log/warn (trs "Warning: expected `redirect` param, but none is present"))
                         (public-settings/site-url))
                       (if (has-host? redirect)
                         redirect
                         (str (public-settings/site-url) redirect)))]
    (sso-utils/check-sso-redirect redirect-url)
    (try
      (let [idp-url      (sso-settings/saml-identity-provider-uri)
            saml-request (saml/request
                           {:request-id (str "id-" (random-uuid))
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

(defn- base64-decode [^String s]
  (when (u/base64-string? s)
    (codecs/bytes->str
      (.decode (Base64/getMimeDecoder) s))))

(defmethod sso.i/sso-post :saml
  ;; Does the verification of the IDP's response and 'logs the user in'. The attributes are available in the response:
  ;; `(get-in saml-info [:assertions :attrs])
  [{:keys [params], :as request}]
  (premium-features/assert-has-feature :sso-saml (tru "SAML-based authentication"))
  (check-saml-enabled)
  (let [continue-url  (u/ignore-exceptions
                        (when-let [s (some-> (:RelayState params) base64-decode)]
                          (when-not (str/blank? s)
                            s)))]
    (sso-utils/check-sso-redirect continue-url)
    (let [xml-string    (str/trim (base64-decode (:SAMLResponse params)))
          saml-response (xml-string->saml-response xml-string)
          attrs         (saml-response->attributes saml-response)
          email         (get attrs (sso-settings/saml-attribute-email))
          first-name    (get attrs (sso-settings/saml-attribute-firstname))
          last-name     (get attrs (sso-settings/saml-attribute-lastname))
          groups        (get attrs (sso-settings/saml-attribute-group))
          session       (fetch-or-create-user!
                          {:first-name      first-name
                           :last-name       last-name
                           :email           email
                           :group-names     groups
                           :user-attributes attrs
                           :device-info     (request.u/device-info request)})
          response      (response/redirect (or continue-url (public-settings/site-url)))]
      (mw.session/set-session-cookies request response session (t/zoned-date-time (t/zone-id "GMT"))))))

(def ^:private saml2-success-status "urn:oasis:names:tc:SAML:2.0:status:Success")

(mu/defn slo-success? :- :boolean
  "Given a slo request saml response, return true if the response is successful."
  [xml-str]
  (let [*success? (atom false)]
    (walk/postwalk
     (fn [x]
       (when (and (map? x)
                  (= (:tag x) :StatusCode)
                  (= (get-in x [:attrs :Value]) saml2-success-status))
         (reset! *success? true))
       x)
     (xml/parse-str xml-str))
    @*success?))

(defmethod sso.i/sso-handle-slo :saml
  [{:keys [cookies params]}]
  (let [xml-str (base64-decode (:SAMLResponse params))
        success? (slo-success? xml-str)]
    (if-let [metabase-session-id (and success? (get-in cookies [mw.session/metabase-session-cookie :value]))]
      (do (t2/delete! :model/Session :id metabase-session-id)
          (mw.session/clear-session-cookie (response/redirect (urls/site-url))))
      {:status 500 :body "SAML logout failed."})))
