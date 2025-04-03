(ns metabase.feature-flags.unleash
  "Unleash feature flag service integration. 
   See https://docs.getunleash.io/reference/client-specification for more info."
  (:require
   [clojure.tools.logging :as log]
   [metabase.config :as config])
  (:import
   (io.getunleash DefaultUnleash Unleash)
   (io.getunleash.util UnleashConfig)))

(def ^:private unleash-config-defaults
  {:app-name "fbebfa45-174c-4f19-b548-84c41ec291f1"
   :instance-id "fbebfa45-174c-4f19-b548-84c41ec291f1"
   :unleash-api "http://localhost:4242/api/"
   :api-key "default:development.unleash-insecure-api-token"})

(defn- build-unleash-config
  "Build an UnleashConfig from a map of options."
  [{:keys [app-name instance-id unleash-api api-key]}]
  (-> (UnleashConfig/builder)
      (.appName app-name)
      (.instanceId instance-id)
      (.unleashAPI unleash-api)
      (.apiKey api-key)
      (.build)))

;; Track the previous state of feature flags for change detection
(def ^:private -feature-flag-state
  (atom {}))

(defonce ^:private -unleash-client
  (atom nil))

(defn initialize!
  "Initialize the Unleash client with the provided options or defaults.
   
   Options:
   - :app-name    - name of the application (default: \"metabase\")
   - :instance-id - unique instance ID (default: \"metabase-{process-uuid}\")
   - :unleash-api - URL to Unleash API (default: \"http://localhost:4242/api/\")
   - :api-key     - API key for Unleash (default: development token)
   
   In production, you should provide at least the :unleash-api and :api-key options."
  ([]
   (initialize! {}))
  ([options]
   (let [config (build-unleash-config (merge unleash-config-defaults options))]
     (log/info "Initializing Unleash client with app-name:" (.getAppName config))
     (reset! -unleash-client (DefaultUnleash. config (into-array io.getunleash.strategy.Strategy []))))))

(defn get-client
  "Get the Unleash client instance. Initializes with defaults if not already initialized."
  ^Unleash []
  (when (nil? @-unleash-client)
    (initialize!))
  @-unleash-client)

(defn- log-feature-flag-change
  "Log when a feature flag state changes from previous check"
  [feature-name current-state]
  (let [previous-state (get @-feature-flag-state feature-name ::not-set)]
    (when (and (not= previous-state ::not-set)
               (not= previous-state current-state))
      (log/info "Feature flag" feature-name "changed from" previous-state "to" current-state))
    (swap! -feature-flag-state assoc feature-name current-state)))

(defn feature-enabled?
  "Check if a feature flag is enabled.
   
   Parameters:
   - feature-name - The name of the feature flag
   - context      - Optional context map
   - default      - Default value if the client is not initialized (default: false)"
  ([feature-name]
   (feature-enabled? feature-name nil false))
  ([feature-name context]
   (feature-enabled? feature-name context false))
  ([feature-name context default-value]
   (try
     (if-let [client (get-client)]
       (let [enabled (.isEnabled client feature-name (boolean default-value))]
         (log-feature-flag-change feature-name enabled)
         enabled)
       default-value)
     (catch Exception e
       (log/warn e "Error checking feature flag:" feature-name)
       default-value))))

(defn db-routing-enabled?
  "Check if the db-routing feature is enabled."
  []
  (feature-enabled? "db-routing" nil false))

;; Log the initial state of important feature flags on namespace load
(try
  (log/info "Initial state of db-routing feature flag:" (db-routing-enabled?))
  (catch Exception e
    (log/warn e "Could not check initial state of feature flags")))
