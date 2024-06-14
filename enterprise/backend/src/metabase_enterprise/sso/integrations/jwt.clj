(ns metabase-enterprise.sso.integrations.jwt
  "Implementation of the JWT backend for sso"
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.api.session :as api.session]
   [metabase.integrations.common :as integrations.common]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.middleware.session :as mw.session]
   [metabase.server.request.util :as req.util]
   [metabase.util.i18n :refer [tru]]
   [ring.util.response :as response])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

(defn fetch-or-create-user!
  "Returns a session map for the given `email`. Will create the user if needed."
  [first-name last-name email user-attributes]
  (when-not (sso-settings/jwt-enabled)
    (throw (IllegalArgumentException. (str (tru "Can't create new JWT user when JWT is not configured")))))
  (let [user {:first_name       first-name
              :last_name        last-name
              :email            email
              :sso_source       :jwt
              :login_attributes user-attributes}]
    (or (sso-utils/fetch-and-update-login-attributes! user)
        (sso-utils/check-user-provisioning :jwt)
        (sso-utils/create-new-sso-user! user))))

(def ^:private ^{:arglists '([])} jwt-attribute-email     (comp keyword sso-settings/jwt-attribute-email))
(def ^:private ^{:arglists '([])} jwt-attribute-firstname (comp keyword sso-settings/jwt-attribute-firstname))
(def ^:private ^{:arglists '([])} jwt-attribute-lastname  (comp keyword sso-settings/jwt-attribute-lastname))
(def ^:private ^{:arglists '([])} jwt-attribute-groups    (comp keyword sso-settings/jwt-attribute-groups))

(def ^:private registered-claims
  "Registered claims in the JWT standard which we should not interpret as login attributes"
  [:iss :iat :sub :aud :exp :nbf :jti])

(defn- jwt-data->login-attributes [jwt-data]
  (apply dissoc
         jwt-data
         (jwt-attribute-email)
         (jwt-attribute-firstname)
         (jwt-attribute-lastname)
         registered-claims))

;; JWTs use seconds since Epoch, not milliseconds since Epoch for the `iat` and `max_age` time. 3 minutes is the time
;; used by Zendesk for their JWT SSO, so it seemed like a good place for us to start
(def ^:private ^:const three-minutes-in-seconds 180)

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names]
  (set (mapcat (sso-settings/jwt-group-mappings)
               (map keyword group-names))))

(defn- all-mapped-group-ids
  "Returns the set of all MB group IDs that have configured mappings"
  []
  (-> (sso-settings/jwt-group-mappings)
      vals
      flatten
      set))

(defn- sync-groups!
  "Sync a user's groups based on mappings configured in the JWT settings"
  [user jwt-data]
  (when (sso-settings/jwt-group-sync)
    (when-let [groups-attribute (jwt-attribute-groups)]
      (when-let [group-names (get jwt-data groups-attribute)]
        (integrations.common/sync-group-memberships! user
                                                     (group-names->ids group-names)
                                                     (all-mapped-group-ids))))))

(defn- session-data
  [jwt {{redirect :return_to} :params, :as request}]
  (let [redirect-url (or redirect (URLEncoder/encode "/"))]
    (sso-utils/check-sso-redirect redirect-url)
    (let [jwt-data     (try
                         (jwt/unsign jwt (sso-settings/jwt-shared-secret)
                                     {:max-age three-minutes-in-seconds})
                         (catch Throwable e
                           (throw (ex-info (ex-message e)
                                           (assoc (ex-data e) :status-code 401)
                                           e))))
          login-attrs  (jwt-data->login-attributes jwt-data)
          email        (get jwt-data (jwt-attribute-email))
          first-name   (get jwt-data (jwt-attribute-firstname))
          last-name    (get jwt-data (jwt-attribute-lastname))
          user         (fetch-or-create-user! first-name last-name email login-attrs)
          session      (api.session/create-session! :sso user (req.util/device-info request))]
      (sync-groups! user jwt-data)
      {:session session, :redirect-url redirect-url, :jwt-data jwt-data})))

(defn- check-jwt-enabled []
  (api/check (sso-settings/jwt-enabled)
    [400 (tru "JWT SSO has not been enabled and/or configured")]))

(defn ^:private generate-response-token
  [session jwt-data]
  (validation/check-embedding-enabled)
  (response/response {:id  (:id session)
                      :exp (:exp jwt-data)
                      :iat (:iat jwt-data)}))

(defn ^:private redirect-to-idp
  [idp redirect]
  (let [return-to-param (if (str/includes? idp "?") "&return_to=" "?return_to=")]
    (response/redirect (str idp (when redirect
                                  (str return-to-param redirect))))))

(defn ^:private handle-jwt-authentication
  [{:keys [session redirect-url jwt-data]} token request]
  (if token
    (generate-response-token session jwt-data)
    (mw.session/set-session-cookies request (response/redirect redirect-url) session (t/zoned-date-time (t/zone-id "GMT")))))

(defmethod sso.i/sso-get :jwt
  [{{:keys [jwt redirect token] :or {token nil}} :params, :as request}]
  (premium-features/assert-has-feature :sso-jwt (tru "JWT-based authentication"))
  (check-jwt-enabled)
  (if jwt
    (handle-jwt-authentication (session-data jwt request) token request)
    (redirect-to-idp (sso-settings/jwt-identity-provider-uri) redirect)))

(defmethod sso.i/sso-post :jwt
  [_]
  (throw (ex-info "POST not valid for JWT SSO requests" {:status-code 400})))
