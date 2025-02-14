(ns metabase-enterprise.sso.api.interface
  (:require
   [metabase-enterprise.sso.api.interface :as sso.i]
   [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
   [ring.util.response :as response]))

(def active-tokens (atom {}))

(defn create-token []
  (str (java.util.UUID/randomUUID)))

(defmethod sso.i/sso-get :token [_]
  (let [token (create-token)]
    (swap! active-tokens assoc token
           {:created (System/currentTimeMillis)})
    ; (-> (response/redirect (str (sso-settings/jwt-identity-provider-uri) "?" "token=true"))
    ;     (response/header "Access-Control-Allow-Credentials" "true"))
    (-> (response/response {:url (str (sso-settings/jwt-identity-provider-uri) "?" "token=true")}) (response/header "Access-Control-Allow-Credentials" "true"))))

(defn valid-token? [token]
  (when-let [token-data (@active-tokens token)]
    (let [now (System/currentTimeMillis)
          created (:created token-data)
          max-age (* 5 60 1000)] ; 5 minutes
      (< (- now created) max-age))))
