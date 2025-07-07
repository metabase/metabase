(ns metabase.branding.config
  (:require
   [clojure.java.io :as io]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private branding-config-path "/app/config/branding.json")

(defonce ^:private branding-config-cache (atom nil))

(defn- load-branding-config-from-file []
  (try
    (when (.exists (io/file branding-config-path))
      (with-open [reader (io/reader branding-config-path)]
        (json/decode+kw reader)))
    (catch Exception e
      (log/warn e "Failed to load branding config from" branding-config-path)
      nil)))

(defn get-branding-config
  "Get the current branding configuration. Returns nil if no config file exists."
  []
  (or @branding-config-cache
      (when-let [config (load-branding-config-from-file)]
        (reset! branding-config-cache config)
        config)))

(defn branding-enabled?
  "Check if custom branding is enabled by checking if branding.json exists."
  []
  (some? (get-branding-config)))

(defn reload-branding-config!
  "Reload branding configuration from file. Used for development/testing."
  []
  (reset! branding-config-cache (load-branding-config-from-file)))

(defn get-logo-url []
  (:logo_url (get-branding-config)))

(defn get-favicon-url []
  (:favicon_url (get-branding-config)))

(defn get-brand-name []
  (:brand_name (get-branding-config)))

(defn get-primary-color []
  (:primary_color (get-branding-config)))

(defn get-branding-for-frontend
  "Get branding configuration formatted for frontend consumption."
  []
  (when-let [config (get-branding-config)]
    {:logo_url (:logo_url config)
     :favicon_url (:favicon_url config)
     :brand_name (:brand_name config "Metabase")
     :primary_color (:primary_color config "#509EE3")
     :enabled true}))