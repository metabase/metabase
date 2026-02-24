#_{:clj-kondo/ignore [:metabase/modules :discouraged-var]}
(ns metabase.core.collector
  "Lightweight event collector entrypoint for Product Analytics.

   Boots only the subsystems required for event ingestion — classloader, app DB,
   settings cache, premium feature check, and the product analytics storage layer.
   Starts in seconds, uses a fraction of the memory, and can be horizontally
   scaled behind a load balancer independently of the main Metabase UI.

   Launch with:  java -jar metabase.jar collector"
  (:require
   [compojure.core :as compojure :refer [context GET OPTIONS]]
   [compojure.route :as route]
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.plugins.core :as plugins]
   [metabase.server.core :as server]
   [metabase.server.middleware.exceptions :as mw.exceptions]
   [metabase.server.middleware.json :as mw.json]
   [metabase.server.middleware.log :as mw.log]
   [metabase.server.middleware.misc :as mw.misc]
   [metabase.server.middleware.premium-features-cache :as mw.pf-cache]
   [metabase.server.middleware.request-id :as mw.request-id]
   [metabase.server.middleware.settings-cache :as mw.settings-cache]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [ring.middleware.gzip :refer [wrap-gzip]]
   [ring.middleware.keyword-params :refer [wrap-keyword-params]]
   [ring.middleware.params :refer [wrap-params]])
  (:import
   (sun.misc Signal SignalHandler)))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Health Probes ----------------------------------------------------

(defn- collector-health-handler
  "Health probe — reports 200 when collector init is complete, 503 otherwise."
  ([]
   (if (init-status/complete?)
     (try
       (if (or (mdb/recent-activity?)
               (mdb/can-connect-to-data-source? (mdb/data-source)))
         {:status 200, :body {:status "ok"}}
         {:status 503, :body {:status "Unable to get app-db connection"}})
       (catch Exception e
         (log/warn e "Error in collector health database check")
         {:status 503, :body {:status "Error getting app-db connection"}}))
     {:status 503, :body {:status "initializing", :progress (init-status/progress)}}))

  ([_request respond _raise]
   (respond (collector-health-handler))))

(defn- livez-handler
  "Simple liveness probe — always returns 200, no database checks."
  ([] {:status 200, :body {:status "ok"}})
  ([_request respond _raise]
   (respond (livez-handler))))

;;; --------------------------------------------------- Routes ----------------------------------------------------------

(defn collector-routes
  "Build the minimal Compojure route tree for the collector.
   Only exposes health probes and the product-analytics /send endpoint."
  []
  #_{:clj-kondo/ignore [:metabase/modules]}
  (classloader/require 'metabase-enterprise.api.routes.common
                       'metabase-enterprise.product-analytics.api.send)
  (let [+require-premium-feature @(resolve 'metabase-enterprise.api.routes.common/+require-premium-feature)
        send-routes              @(resolve 'metabase-enterprise.product-analytics.api.send/routes)
        feature-name             (deferred-tru "Product Analytics")
        gated-send               (+require-premium-feature :product-analytics feature-name send-routes)]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (compojure/routes
     (GET "/api/health" [] collector-health-handler)
     (GET "/readyz" [] collector-health-handler)
     (GET "/livez" [] livez-handler)
     (OPTIONS "/api/*" [] {:status 200, :body ""})
     (context "/api/ee/product-analytics" [] gated-send)
     (route/not-found {:status 404, :body "Not found"}))))

;;; --------------------------------------------------- Middleware -------------------------------------------------------

(def ^:private collector-middleware
  "Minimal middleware stack for the collector — no session/auth, no paging, no
   browser cookies, no security headers (no HTML), no SSL redirect.
   Applied top-to-bottom; requests see handlers bottom-to-top."
  [#'mw.exceptions/catch-uncaught-exceptions
   #'mw.exceptions/catch-api-exceptions
   #'mw.log/log-api-call
   #'mw.json/wrap-json-body
   #'mw.json/wrap-streamed-json-response
   #'wrap-keyword-params
   #'wrap-params
   #'mw.misc/add-content-type
   #'mw.misc/add-version
   #'mw.settings-cache/wrap-settings-cache-check
   #'mw.pf-cache/wrap-premium-features-cache-check
   #'wrap-gzip
   #'mw.request-id/wrap-request-id
   #'mw.misc/bind-request])

(defn apply-collector-middleware
  "Apply the collector middleware stack to a handler."
  [handler]
  (reduce
   (fn [handler middleware-fn]
     (middleware-fn handler))
   handler
   collector-middleware))

;;; --------------------------------------------------- Signal Logging ---------------------------------------------------

(defn- signal-handler
  "Create a signal handler that logs the received signal and delegates to the original handler."
  [^String signal-name ^SignalHandler original-handler]
  (reify SignalHandler
    (handle [_ sig]
      (log/warnf "Received system signal: SIG%s" (.getName sig))
      (when original-handler
        (try
          (.handle original-handler sig)
          (catch Exception e
            (log/errorf e "Error calling original signal handler for SIG%s" signal-name)))))))

(defn- init-signal-logging!
  "Set up signal handlers to log system signals like SIGTERM, SIGINT, etc."
  []
  (doseq [signal-name ["TERM" "INT" "HUP" "QUIT"]]
    (try
      (let [signal           (Signal. signal-name)
            original-handler (try
                               (Signal/handle signal SignalHandler/SIG_DFL)
                               (catch Exception _ nil))
            logging-handler  (signal-handler signal-name original-handler)]
        (Signal/handle signal logging-handler))
      (catch IllegalArgumentException e
        (log/debugf "Ignoring invalid signal SIG%s: %s" signal-name (.getMessage e)))
      (catch Exception e
        (log/warnf e "Failed to register signal handler for SIG%s" signal-name)))))

;;; --------------------------------------------------- Lifecycle --------------------------------------------------------

(defn- collector-init!
  "Minimal initialization for the collector — only what the /send endpoint needs."
  []
  (log/infof "Starting Metabase Collector version %s ..." config/mb-version-string)
  (init-signal-logging!)
  (init-status/set-progress! 0.1)
  ;; Ensure the classloader is installed
  (classloader/the-classloader)
  ;; Load EE plugins (needed for product-analytics module)
  (plugins/load-plugins!)
  (init-status/set-progress! 0.3)
  (setting/validate-settings-formatting!)
  ;; Start database — validate connection and run any necessary migrations
  (log/info "Setting up and migrating Metabase DB. Please sit tight, this may take a minute...")
  (mdb/setup-db! :create-sample-content? false)
  (init-status/set-progress! 0.6)
  ;; Ensure PA virtual DB and tables exist
  #_{:clj-kondo/ignore [:metabase/modules]}
  (classloader/require 'metabase-enterprise.product-analytics.setup)
  (when-let [ensure-fn (resolve 'metabase-enterprise.product-analytics.setup/ensure-product-analytics-db-installed!)]
    (ensure-fn))
  (init-status/set-progress! 0.9)
  (init-status/set-complete!)
  (log/info "Collector Initialization COMPLETE"))

(defn- destroy!
  "Shutdown function for the collector."
  []
  (log/info "Collector Shutting Down ...")
  ;; Flush any buffered storage data (e.g. Iceberg)
  (try
    #_{:clj-kondo/ignore [:metabase/modules]}
    (classloader/require 'metabase-enterprise.product-analytics.storage)
    (when-let [flush-fn (resolve 'metabase-enterprise.product-analytics.storage/store-flush!)]
      (flush-fn))
    (catch Exception e
      (log/warn e "Error flushing storage during shutdown")))
  (server/stop-web-server!)
  (let [timeout-seconds 20]
    (mdb/release-migration-locks! timeout-seconds))
  (log/info "Collector Shutdown COMPLETE"))

(defn start!
  "Start Metabase in COLLECTOR mode — a minimal event ingestion server."
  []
  (log/info "Starting Metabase in COLLECTOR mode")
  (try
    ;; Build routes and handler, start Jetty first (non-blocking)
    (let [routes  (collector-routes)
          handler (apply-collector-middleware routes)]
      (server/start-web-server! handler))
    ;; Run minimal initialization
    (collector-init!)
    ;; Register shutdown hook after successful init
    (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
    ;; Block forever while Jetty runs
    (when (config/config-bool :mb-jetty-join)
      (.join (server/instance)))
    (catch Throwable e
      (log/error e "Collector Initialization FAILED")
      (System/exit 1))))
