(ns metabase-enterprise.sso.integrations.jwt
  "Implementation of the JWT backend for sso"
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.integrations.token-utils :as token-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.embedding.settings :as embed.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.sso.core :as sso]
   [metabase.util.i18n :refer [tru]]
   [ring.util.response :as response]
   [toucan2.core :as t2])
  (:import
   (java.net URLEncoder)))

(set! *warn-on-reflection* true)

(defn fetch-or-create-user!
  "Returns a session map for the given `email`. Will create the user if needed."
  [first-name last-name email user-attributes]
  (when-not (sso-settings/jwt-enabled)
    (throw
     (IllegalArgumentException.
      (str (tru "Can''t create new JWT user when JWT is not configured")))))
  (let [user {:first_name       first-name
              :last_name        last-name
              :email            email
              :sso_source       :jwt
              :jwt_attributes   user-attributes}]
    (or (sso-utils/fetch-and-update-login-attributes! user (sso-settings/jwt-user-provisioning-enabled?))
        (sso-utils/check-user-provisioning :jwt)
        (sso-utils/create-new-sso-user! user))))

(def ^:private ^{:arglists '([])} jwt-attribute-email
  (comp keyword sso-settings/jwt-attribute-email))

(def ^:private ^{:arglists '([])} jwt-attribute-firstname
  (comp keyword sso-settings/jwt-attribute-firstname))

(def ^:private ^{:arglists '([])} jwt-attribute-lastname
  (comp keyword sso-settings/jwt-attribute-lastname))

(def ^:private ^{:arglists '([])} jwt-attribute-groups
  (comp keyword sso-settings/jwt-attribute-groups))

(def ^:private registered-claims
  "Registered claims in the JWT standard which we should not interpret as login attributes"
  [:iss :iat :sub :aud :exp :nbf :jti])

(defn- jwt-data->login-attributes [jwt-data]
  (sso-utils/filter-non-stringable-attributes
   (apply dissoc
          jwt-data
          (jwt-attribute-email)
          (jwt-attribute-firstname)
          (jwt-attribute-lastname)
          (jwt-attribute-groups)
          registered-claims)))

;; JWTs use seconds since Epoch, not milliseconds since Epoch for the `iat` and `max_age` time. 3 minutes is the time
;; used by Zendesk for their JWT SSO, so it seemed like a good place for us to start
(def ^:private ^:const three-minutes-in-seconds 180)

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names]
  (if-let [name-mappings (not-empty (sso-settings/jwt-group-mappings))]
    (set
     (mapcat name-mappings
             (map keyword group-names)))
    (t2/select-pks-set :model/PermissionsGroup :name [:in group-names])))

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
        (if (empty? (sso-settings/jwt-group-mappings))
          (sso/sync-group-memberships! user (group-names->ids group-names))
          (sso/sync-group-memberships! user
                                       (group-names->ids group-names)
                                       (all-mapped-group-ids)))))))

(defn- session-data
  [jwt {{redirect :return_to} :params, :as request}]
  (let [redirect-url (or redirect "/")]
    (sso-utils/check-sso-redirect redirect-url)
    (let [jwt-data     (try
                         (jwt/unsign jwt (sso-settings/jwt-shared-secret)
                                     {:max-age three-minutes-in-seconds})
                         (catch Throwable e
                           (throw
                            (ex-info (ex-message e)
                                     {:status-code 401}))))
          login-attrs  (jwt-data->login-attributes jwt-data)
          email        (get jwt-data (jwt-attribute-email))
          first-name   (get jwt-data (jwt-attribute-firstname))
          last-name    (get jwt-data (jwt-attribute-lastname))
          user         (fetch-or-create-user! first-name last-name email login-attrs)
          session      (session/create-session! :sso user (request/device-info request))]
      (sync-groups! user jwt-data)
      {:session session, :redirect-url redirect-url, :jwt-data jwt-data})))

(defn jwt->session
  "Given a JWT, return a valid session token for the associated user (creating the user if necessary)."
  [jwt request]
  (-> (session-data jwt request) :session :key))

(defn- throw-react-sdk-embedding-disabled
  []
  (throw
   (ex-info (tru "Embedding SDK for React is disabled. Enable it in the embedding settings.")
            {:status      "error-embedding-sdk-disabled"
             :status-code 402})))

(defn- throw-simple-embedding-disabled
  []
  (throw
   (ex-info (tru "Embedded Analytics JS is disabled. Enable it in the embedding settings.")
            {:status      "error-embedding-simple-disabled"
             :status-code 402})))

(defn ^:private generate-response-token
  [session jwt-data]
  (response/response
   {:status :ok
    :id     (:key session)
    :exp    (:exp jwt-data)
    :iat    (:iat jwt-data)}))

(defn ^:private redirect-to-idp
  [idp redirect]
  (let [return-to-param (if (str/includes? idp "?") "&return_to=" "?return_to=")]
    (response/redirect
     (str idp
          (when redirect
            (str return-to-param redirect))))))

(defmethod sso.i/sso-get :jwt
  [{{:keys [jwt redirect]} :params, :as request}]
  (premium-features/assert-has-feature :sso-jwt (tru "JWT-based authentication"))
  (let [jwt-data (when jwt (session-data jwt request))
        is-react-sdk? (sso-utils/is-react-sdk-header? request)
        is-simple-embed? (sso-utils/is-simple-embed-header? request)
        is-embed? (or is-react-sdk? is-simple-embed?)]
    (cond
      (and is-react-sdk? (not (embed.settings/enable-embedding-sdk))) (throw-react-sdk-embedding-disabled)
      (and is-simple-embed? (not (embed.settings/enable-embedding-simple))) (throw-simple-embedding-disabled)
      (and is-embed? jwt (token-utils/has-token request)) (generate-response-token (:session jwt-data) (:jwt-data jwt-data))
      is-embed?           (response/response (token-utils/with-token {:url (sso-settings/jwt-identity-provider-uri) :method "jwt"}))
      jwt               (request/set-session-cookies request
                                                     (response/redirect (:redirect-url jwt-data))
                                                     (:session jwt-data)
                                                     (t/zoned-date-time (t/zone-id "GMT")))
      :else             (redirect-to-idp (sso-settings/jwt-identity-provider-uri) redirect))))

(defmethod sso.i/sso-post :jwt
  [_]
  (throw
   (ex-info (tru "POST not valid for JWT SSO requests")
            {:status "error-post-jwt-not-valid" :status-code 501})))
