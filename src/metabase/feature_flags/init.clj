(ns metabase.feature-flags.init
  "Initialization code for feature flags."
  (:require
   [clojure.tools.logging :as log]
   [metabase.config :as config]
   [metabase.feature-flags.unleash :as unleash]))

(defn- get-unleash-config-from-env
  "Get Unleash configuration from environment variables."
  []
  (let [api-url (config/config-str :mb-unleash-url)
        api-key (config/config-str :mb-unleash-api-key)
        app-name (config/config-str :mb-unleash-app-name)
        instance-id (config/config-str :mb-unleash-instance-id)]
    (cond-> {}
      api-url (assoc :unleash-api api-url)
      api-key (assoc :api-key api-key)
      app-name (assoc :app-name app-name)
      instance-id (assoc :instance-id instance-id))))

;; Initialize Unleash when this namespace is loaded
(when-not config/is-test?
  (try
    (log/info "Initializing Unleash feature flag service")
    (unleash/initialize! (get-unleash-config-from-env))
    (catch Exception e
      (log/warn e "Failed to initialize Unleash feature flag service"))))