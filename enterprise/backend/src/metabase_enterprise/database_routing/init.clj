(ns metabase-enterprise.database-routing.init
  "Initialize the enterprise database routing module."
  (:require
   [clojure.tools.logging :as log]
   [metabase-enterprise.database-routing.common :as common]
   [metabase.feature-flags.unleash :as unleash]))

;; Log that we've loaded the enterprise database routing module
(log/info "Initializing Enterprise Database Routing module")

;; Check for the feature flag at init time, for early logging and state tracking
(try
  (log/info "Checking database routing feature flag on initialization")
  ;; This will log and track the initial state
  (let [feature-enabled? (unleash/db-routing-enabled?)]
    (log/info "Database Routing feature flag status on initialization:"
              (if feature-enabled? "ENABLED" "DISABLED")))
  (catch Exception e
    (log/warn e "Error checking database routing feature flag status on initialization")))