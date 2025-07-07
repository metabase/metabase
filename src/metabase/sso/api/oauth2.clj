(ns metabase.sso.api.oauth2
  (:require
   [compojure.core :refer [GET POST]]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.sso.config :as sso.config]
   [metabase.sso.oauth2 :as oauth2]
   [metabase.util.i18n :refer [tru]]
   [ring.util.response :as response]))

(def ^{:arglists '([request respond raise])} routes
  (api.macros/routes
   (GET "/login" request
     "Start the SSO authentication flow."
     (if (sso.config/sso-enabled?)
       (oauth2/get-auth-url request)
       {:status 404
        :body {:message (tru "SSO is not configured.")}}))
   
   (GET "/callback" request
     "Handle the SSO authentication callback."
     (if (sso.config/sso-enabled?)
       (let [user (oauth2/handle-callback request)]
         ;; Create a session for the user (similar to existing auth flows)
         (let [session-id (str (java.util.UUID/randomUUID))]
           ;; TODO: Actually create session in Metabase's session system
           ;; For now, return user info and let frontend handle session creation
           {:status 200
            :body {:user_id (:id user)
                   :email (:email user)
                   :first_name (:first_name user)
                   :last_name (:last_name user)
                   :session_id session-id}}))
       {:status 404
        :body {:message (tru "SSO is not configured.")}}))
   
   (GET "/config" request
     "Get SSO configuration for frontend (client_id, provider name, etc.)"
     (if-let [config (sso.config/get-sso-config)]
       {:status 200
        :body {:provider (:provider config)
               :enabled true}}
       {:status 200
        :body {:enabled false}}))))

;; Export for external use
(comment oauth2/keep-me)