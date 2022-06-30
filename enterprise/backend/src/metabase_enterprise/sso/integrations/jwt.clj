(ns metabase-enterprise.sso.integrations.jwt
  "Implementation of the JWT backend for sso"
  (:require [buddy.sign.jwt :as jwt]
            [clojure.string :as str]
            [metabase-enterprise.sso.api.interface :as sso.i]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.api.common :as api]
            [metabase.server.middleware.session :as mw.session]
            [metabase.server.request.util :as request.u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.sso :as sso-utils]
            [ring.util.response :as response])
  (:import java.net.URLEncoder))

;; JWTs use seconds since Epoch, not milliseconds since Epoch for the `iat` and `max_age` time. 3 minutes is the time
;; used by Zendesk for their JWT SSO, so it seemed like a good place for us to start
(def ^:private ^:const three-minutes-in-seconds 180)

(defn- check-jwt-enabled []
  (api/check (sso-settings/jwt-configured?)
    [400 (tru "JWT SSO has not been enabled and/or configured")]))

(defmethod sso.i/sso-get :jwt
  [{{:keys [jwt return_to]} :params, :as request}]
  (check-jwt-enabled)
  (let [redirect-url (or return_to (URLEncoder/encode "/"))]
    (sso-utils/check-sso-redirect redirect-url)
    (if jwt
      (let [sso-data (try
                       (jwt/unsign jwt (sso-settings/jwt-shared-secret)
                                   {:max-age three-minutes-in-seconds})
                       (catch Throwable e
                         (throw (ex-info (ex-message e)
                                         (assoc (ex-data e) :status-code 401)
                                         e))))
            device-info (request.u/device-info request)
            sso-settings                       {:sso-source          "jwt"
                                                :group-mappings      (sso-settings/jwt-group-mappings)
                                                :group-sync          (sso-settings/jwt-group-sync)
                                                :attribute-email     (sso-settings/jwt-attribute-email)
                                                :attribute-firstname (sso-settings/jwt-attribute-firstname)
                                                :attribute-lastname  (sso-settings/jwt-attribute-lastname)
                                                :attribute-groups    (sso-settings/jwt-attribute-groups)
                                                :configured?         (sso-settings/jwt-configured?)}
            user                               (sso-utils/fetch-or-create-user! sso-data sso-settings)
            session                            (sso-utils/create-session! :sso user device-info)
            response                           (response/redirect redirect-url)]
        (mw.session/set-session-cookie request response session))
      (let [idp             (sso-settings/jwt-identity-provider-uri)
            return-to-param (if (str/includes? idp "?") "&return_to=" "?return_to=")]
        (response/redirect (str idp (when return_to
                                      (str return-to-param return_to))))))))

(defmethod sso.i/sso-post :jwt
  [_]
  (throw (ex-info "POST not valid for JWT SSO requests" {:status-code 400})))
