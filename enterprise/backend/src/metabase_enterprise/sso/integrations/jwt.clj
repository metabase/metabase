(ns metabase-enterprise.sso.integrations.jwt
  "Implementation of the JWT backend for sso"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-utils :as sso-utils]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.embedding.settings :as embed.settings]
   [metabase.embedding.util :as embed.util]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- session-data
  [jwt {{redirect :return_to} :params, :as request}]
  (let [redirect-url (sso-utils/check-sso-redirect (or redirect "/"))
        login-result (when jwt
                       (auth-identity/login! :provider/jwt
                                             (assoc request
                                                    :token jwt
                                                    :redirect-url redirect-url
                                                    :device-info (request/device-info request))))]
    (cond
      (nil? login-result)
      {:redirect-url redirect-url}
      ;; Login succeeded
      (:success? login-result)
      (select-keys login-result [:session :redirect-url :jwt-data])

      :else
      (throw (ex-info (or (str (:message login-result)) "JWT authentication failed")
                      {:status-code 401})))))

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
   (ex-info (tru "You need to turn on modular embedding in the embedding settings.")
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
  (let [result (session-data jwt request)
        is-react-sdk? (embed.util/has-react-sdk-header? request)
        is-embedded-analytics-js? (embed.util/has-embedded-analytics-js-header? request)
        is-modular-embedding? (or is-react-sdk? is-embedded-analytics-js?)]
    (cond
      ;; Embedding feature checks
      (and is-react-sdk? (not (embed.settings/enable-embedding-sdk)))
      (throw-react-sdk-embedding-disabled)

      (and is-embedded-analytics-js? (not (embed.settings/enable-embedding-simple)))
      (throw-simple-embedding-disabled)

      (and is-modular-embedding? jwt)
      (generate-response-token (:session result) (:jwt-data result))

      ;; JWT provided - use auth-identity/login!
      jwt
      (request/set-session-cookies request
                                   (response/redirect (:redirect-url result))
                                   (:session result)
                                   (t/zoned-date-time (t/zone-id "GMT")))

      ;; No JWT - return IdP URL for modular embedding or redirect
      is-modular-embedding?
      (response/response {:url (sso-settings/jwt-identity-provider-uri)
                          :method "jwt"})

      :else
      (redirect-to-idp (sso-settings/jwt-identity-provider-uri) redirect))))

(defmethod sso.i/sso-post :jwt
  [_]
  (throw
   (ex-info (tru "POST not valid for JWT SSO requests")
            {:status "error-post-jwt-not-valid" :status-code 501})))
