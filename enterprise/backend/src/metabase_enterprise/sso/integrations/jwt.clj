(ns metabase-enterprise.sso.integrations.jwt
  "Implementation of the JWT backend for sso"
  (:require [buddy.sign.jwt :as jwt]
            [metabase-enterprise.sso.api.sso :as sso]
            [metabase-enterprise.sso.integrations
             [sso-settings :as sso-settings]
             [sso-utils :as sso-utils]]
            [metabase.api
             [common :as api]
             [session :as session]]
            [metabase.integrations.common :as integrations.common]
            [metabase.middleware.session :as mw.session]
            [metabase.util.i18n :refer [tru]]
            [ring.util.response :as resp])
  (:import java.net.URLEncoder))

(defn fetch-or-create-user!
  "Returns a session map for the given `email`. Will create the user if needed."
  [first-name last-name email user-attributes]
  (when-not (sso-settings/jwt-configured?)
    (throw (IllegalArgumentException. (str (tru "Can't create new JWT user when JWT is not configured")))))
  (or (sso-utils/fetch-and-update-login-attributes! email user-attributes)
      (sso-utils/create-new-sso-user! {:first_name       first-name
                                       :last_name        last-name
                                       :email            email
                                       :sso_source       "jwt"
                                       :login_attributes user-attributes})))

(def ^:private ^{:arglists '([])} jwt-attribute-email     (comp keyword sso-settings/jwt-attribute-email))
(def ^:private ^{:arglists '([])} jwt-attribute-firstname (comp keyword sso-settings/jwt-attribute-firstname))
(def ^:private ^{:arglists '([])} jwt-attribute-lastname  (comp keyword sso-settings/jwt-attribute-lastname))
(def ^:private ^{:arglists '([])} jwt-attribute-groups    (comp keyword sso-settings/jwt-attribute-groups))

(defn- jwt-data->login-attributes [jwt-data]
  (dissoc jwt-data
          (jwt-attribute-email)
          (jwt-attribute-firstname)
          (jwt-attribute-lastname)
          :iat
          :max_age))

;; JWTs use seconds since Epoch, not milliseconds since Epoch for the `iat` and `max_age` time. 3 minutes is the time
;; used by Zendesk for their JWT SSO, so it seemed like a good place for us to start
(def ^:private ^:const three-minutes-in-seconds 180)

(defn- group-names->ids [group-names]
  (set (mapcat (sso-settings/jwt-group-mappings)
               (map keyword group-names))))

(defn- sync-groups! [user jwt-data]
  (when (sso-settings/jwt-group-sync)
    (when-let [groups-attribute (jwt-attribute-groups)]
      (when-let [group-names (get jwt-data (jwt-attribute-groups))]
        (integrations.common/sync-group-memberships! user (group-names->ids group-names))))))

(defn- login-jwt-user
  [jwt {{redirect :return_to} :params, :as request}]
  (let [jwt-data     (jwt/unsign jwt (sso-settings/jwt-shared-secret)
                                 {:max-age three-minutes-in-seconds})
        login-attrs  (jwt-data->login-attributes jwt-data)
        email        (get jwt-data (jwt-attribute-email))
        first-name   (get jwt-data (jwt-attribute-firstname) "Unknown")
        last-name    (get jwt-data (jwt-attribute-lastname) "Unknown")
        user         (fetch-or-create-user! first-name last-name email login-attrs)
        session      (session/create-session! :sso user)
        redirect-url (or redirect (URLEncoder/encode "/"))]
    (sync-groups! user jwt-data)
    (mw.session/set-session-cookie request (resp/redirect redirect-url) session)))

(defn- check-jwt-enabled []
  (api/check (sso-settings/jwt-configured?)
    [400 (tru "JWT SSO has not been enabled and/or configured")]))

(defmethod sso/sso-get :jwt
  [{{:keys [jwt redirect]} :params, :as request}]
  (check-jwt-enabled)
  (if jwt
    (login-jwt-user jwt request)
    (resp/redirect (str (sso-settings/jwt-identity-provider-uri)
                        (when redirect
                          (str "?return_to=" redirect))))))

(defmethod sso/sso-post :jwt
  [req]
  (throw (ex-info "POST not valid for JWT SSO requests" {:status-code 400})))
