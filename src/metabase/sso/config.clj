(ns metabase.sso.config
  (:require
   [clojure.java.io :as io]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private sso-config-path "/app/config/sso.json")

(defonce ^:private sso-config-cache (atom nil))

(defn- load-sso-config-from-file []
  (try
    (when (.exists (io/file sso-config-path))
      (with-open [reader (io/reader sso-config-path)]
        (json/decode+kw reader)))
    (catch Exception e
      (log/warn e "Failed to load SSO config from" sso-config-path)
      nil)))

(defn get-sso-config
  "Get the current SSO configuration. Returns nil if no config file exists."
  []
  (or @sso-config-cache
      (when-let [config (load-sso-config-from-file)]
        (reset! sso-config-cache config)
        config)))

(defn sso-enabled?
  "Check if SSO is enabled by checking if sso.json exists and has required fields."
  []
  (when-let [config (get-sso-config)]
    (and (:provider config)
         (:client_id config)
         (:client_secret config)
         (:auth_url config)
         (:token_url config)
         (:userinfo_url config))))

(defn reload-sso-config!
  "Reload SSO configuration from file. Used for development/testing."
  []
  (reset! sso-config-cache (load-sso-config-from-file)))

(defn get-provider []
  (:provider (get-sso-config)))

(defn get-client-id []
  (:client_id (get-sso-config)))

(defn get-client-secret []
  (:client_secret (get-sso-config)))

(defn get-auth-url []
  (:auth_url (get-sso-config)))

(defn get-token-url []
  (:token_url (get-sso-config)))

(defn get-userinfo-url []
  (:userinfo_url (get-sso-config)))

(defn get-scopes []
  (:scopes (get-sso-config) ["openid" "email" "profile"]))

(defn get-default-group []
  (:default_group (get-sso-config) "Viewers"))