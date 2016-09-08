;; -*- comment-column: 35; -*-
(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [ring.adapter.jetty :as ring-jetty]
            (ring.middleware [cookies :refer [wrap-cookies]]
                             [gzip :refer [wrap-gzip]]
                             [json :refer [wrap-json-response
                                           wrap-json-body]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])
            [medley.core :as m]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver]
                      [events :as events]
                      [logger :as logger]
                      [metabot :as metabot]
                      [middleware :as mb-middleware]
                      [plugins :as plugins]
                      [routes :as routes]
                      [sample-data :as sample-data]
                      [setup :as setup]
                      [task :as task]
                      [util :as u])
            (metabase.models [setting :refer [defsetting]]
                             [user :refer [User]])))

;;; CONFIG

(def ^:private app
  "The primary entry point to the Ring HTTP server."
  (-> routes/routes
      mb-middleware/log-api-call
      mb-middleware/add-security-headers ; Add HTTP headers to API responses to prevent them from being cached
      (wrap-json-body                    ; extracts json POST body and makes it avaliable on request
        {:keywords? true})
      wrap-json-response                 ; middleware to automatically serialize suitable objects as JSON in responses
      wrap-keyword-params                ; converts string keys in :params to keyword keys
      wrap-params                        ; parses GET and POST params as :query-params/:form-params and both as :params
      mb-middleware/bind-current-user    ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
      mb-middleware/wrap-current-user-id ; looks for :metabase-session-id and sets :metabase-user-id if Session ID is valid
      mb-middleware/wrap-api-key         ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
      mb-middleware/wrap-session-id      ; looks for a Metabase Session ID and assoc as :metabase-session-id
      wrap-cookies                       ; Parses cookies in the request map and assocs as :cookies
      wrap-session                       ; reads in current HTTP session and sets :session/key
      wrap-gzip))                        ; GZIP response if client can handle it


;;; ## ---------------------------------------- LIFECYCLE ----------------------------------------

(defonce ^:private metabase-initialization-progress
  (atom 0))

(defn initialized?
  "Is Metabase initialized and ready to be served?"
  []
  (= @metabase-initialization-progress 1.0))

(defn initialization-progress
  "Get the current progress of Metabase initialization."
  []
  @metabase-initialization-progress)

(defn initialization-complete!
  "Complete the Metabase initialization by setting its progress to 100%."
  []
  (reset! metabase-initialization-progress 1.0))

(defn- -init-create-setup-token
  "Create and set a new setup token and log it."
  []
  (let [setup-token (setup/create-token!)                    ; we need this here to create the initial token
        hostname    (or (config/config-str :mb-jetty-host) "localhost")
        port        (config/config-int :mb-jetty-port)
        setup-url   (str "http://"
                         (or hostname "localhost")
                         (when-not (= 80 port) (str ":" port))
                         "/setup/")]
    (log/info (u/format-color 'green "Please use the following url to setup your Metabase installation:\n\n%s\n\n"
                              setup-url))))

(defn- destroy!
  "General application shutdown function which should be called once at application shuddown."
  []
  (log/info "Metabase Shutting Down ...")
  (task/stop-scheduler!)
  (log/info "Metabase Shutdown COMPLETE"))

(defn init!
  "General application initialization function which should be run once at application startup."
  []
  (log/info (format "Starting Metabase version %s ..." config/mb-version-string))
  (log/info (format "System timezone is '%s' ..." (System/getProperty "user.timezone")))
  (reset! metabase-initialization-progress 0.1)

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
  (reset! metabase-initialization-progress 0.2)

  ;; load any plugins as needed
  (plugins/load-plugins!)
  (reset! metabase-initialization-progress 0.3)

  ;; Load up all of our Database drivers, which are used for app db work
  (driver/find-and-load-drivers!)
  (reset! metabase-initialization-progress 0.4)

  ;; startup database.  validates connection & runs any necessary migrations
  (db/setup-db :auto-migrate (config/config-bool :mb-db-automigrate))
  (reset! metabase-initialization-progress 0.5)

  ;; run a very quick check to see if we are doing a first time installation
  ;; the test we are using is if there is at least 1 User in the database
  (let [new-install (not (db/exists? User))]

    ;; Bootstrap the event system
    (events/initialize-events!)
    (reset! metabase-initialization-progress 0.7)

    ;; Now start the task runner
    (task/start-scheduler!)
    (reset! metabase-initialization-progress 0.8)

    (when new-install
      (log/info "Looks like this is a new installation ... preparing setup wizard")
      ;; create setup token
      (-init-create-setup-token)
      ;; publish install event
      (events/publish-event :install {}))
    (reset! metabase-initialization-progress 0.9)

    ;; deal with our sample dataset as needed
    (if new-install
      ;; add the sample dataset DB for fresh installs
      (sample-data/add-sample-dataset!)
      ;; otherwise update if appropriate
      (sample-data/update-sample-dataset-if-needed!))

    ;; start the metabot thread
    (metabot/start-metabot!))

  (initialization-complete!)
  (log/info "Metabase Initialization COMPLETE"))


;;; ## ---------------------------------------- Jetty (Web) Server ----------------------------------------


(def ^:private jetty-instance
  (atom nil))

(defn start-jetty!
  "Start the embedded Jetty web server."
  []
  (when-not @jetty-instance
    (let [jetty-ssl-config (m/filter-vals identity {:ssl-port       (config/config-int :mb-jetty-ssl-port)
                                                    :keystore       (config/config-str :mb-jetty-ssl-keystore)
                                                    :key-password   (config/config-str :mb-jetty-ssl-keystore-password)
                                                    :truststore     (config/config-str :mb-jetty-ssl-truststore)
                                                    :trust-password (config/config-str :mb-jetty-ssl-truststore-password)})
          jetty-config     (cond-> (m/filter-vals identity {:port          (config/config-int :mb-jetty-port)
                                                            :host          (config/config-str :mb-jetty-host)
                                                            :max-threads   (config/config-int :mb-jetty-maxthreads)
                                                            :min-threads   (config/config-int :mb-jetty-minthreads)
                                                            :max-queued    (config/config-int :mb-jetty-maxqueued)
                                                            :max-idle-time (config/config-int :mb-jetty-maxidletime)})
                             (config/config-str :mb-jetty-daemon) (assoc :daemon? (config/config-bool :mb-jetty-daemon))
                             (config/config-str :mb-jetty-ssl)    (-> (assoc :ssl? true)
                                                                      (merge jetty-ssl-config)))]
      (log/info "Launching Embedded Jetty Webserver with config:\n" (with-out-str (clojure.pprint/pprint (m/filter-keys (fn [k] (not (re-matches #".*password.*" (str k)))) jetty-config))))
      ;; NOTE: we always start jetty w/ join=false so we can start the server first then do init in the background
      (->> (ring-jetty/run-jetty app (assoc jetty-config :join? false))
           (reset! jetty-instance)))))

(defn stop-jetty!
  "Stop the embedded Jetty web server."
  []
  (when @jetty-instance
    (log/info "Shutting Down Embedded Jetty Webserver")
    (.stop ^org.eclipse.jetty.server.Server @jetty-instance)
    (reset! jetty-instance nil)))


;;; ## ---------------------------------------- App Main ----------------------------------------


(defn- start-normally []
  (log/info "Starting Metabase in STANDALONE mode")
  (try
    ;; launch embedded webserver async
    (start-jetty!)
    ;; run our initialization process
    (init!)
    ;; Ok, now block forever while Jetty does its thing
    (when (config/config-bool :mb-jetty-join)
      (.join ^org.eclipse.jetty.server.Server @jetty-instance))
    (catch Throwable e
      (.printStackTrace e)
      (log/error "Metabase Initialization FAILED: " (.getMessage e))
      (System/exit 1))))

(def ^:private cmd->fn
  {:migrate      (fn [direction]
                   (db/migrate @db/db-connection-details (keyword direction)))
   :load-from-h2 (fn [& [h2-connection-string-or-nil]]
                   (require 'metabase.cmd.load-from-h2)
                   ((resolve 'metabase.cmd.load-from-h2/load-from-h2!) h2-connection-string-or-nil))})

(defn- run-cmd [cmd & args]
  (let [f (or (cmd->fn cmd)
              (do (println (u/format-color 'red "Unrecognized command: %s" (name cmd)))
                  (println "Valid commands are:\n" (u/pprint-to-str (map name (keys cmd->fn))))
                  (System/exit 1)))]
    (try (apply f args)
         (catch Throwable e
           (.printStackTrace e)
           (println (u/format-color 'red "Command failed with exception: %s" (.getMessage e)))
           (System/exit 1)))
    (println "Success.")
    (System/exit 0)))

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (if cmd
    (apply run-cmd (keyword cmd) args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally)))                 ; with no command line args just start Metabase normally
