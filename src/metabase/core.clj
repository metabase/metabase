;; -*- comment-column: 35; -*-
(ns metabase.core
  (:gen-class)
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            (metabase [config :as config]
                      [db :as db]
                      [driver :as driver]
                      [events :as events]
                      logger
                      [metabot :as metabot]
                      [plugins :as plugins]
                      [sample-data :as sample-data]
                      [setup :as setup]
                      [task :as task]
                      [util :as u])
            [metabase.models.user :refer [User]])
  (:import org.eclipse.jetty.server.Server))


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

(defn- create-setup-token!
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


(defn- do-background-initialization!
  "Run tasks that don't need to be completed before Metabase starts up on a background thread."
  []
  (future
    (try
      ;; load any plugins and then load up all of our Database drivers (on a background thread)
      ;; this can be done on a background thread because we only need the driver for the application DB (H2/Postgres/MySQL)
      ;; but that gets automatically loaded anyway
      (plugins/load-plugins!)
      (driver/find-and-load-drivers!)

      ;; Bootstrap the event system. Do this on a background thread thread because it takes a couple seconds to launch
      (events/initialize-events!)

      ;; start the task scheduler
      (task/start-scheduler!)

      ;; start the metabot thread
      (metabot/start-metabot!)

      (catch Throwable e
        (log/error "Background initialization failed:" e)
        (System/exit 1)))))


(defn init!
  "General application initialization function which should be run once at application startup."
  []
  (log/info (format "Starting Metabase version %s ..." config/mb-version-string))
  (log/info (format "System timezone is '%s' ..." (System/getProperty "user.timezone")))

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
  (reset! metabase-initialization-progress 0.2)

  ;; startup database. Validates connection & runs any necessary migrations
  (db/setup-db! :auto-migrate (config/config-bool :mb-db-automigrate))
  (reset! metabase-initialization-progress 0.8)

  (do-background-initialization!)

  ;; run a very quick check to see if we are doing a first time installation (there are no Users in the DB)
  (let [new-install (not (db/exists? User))]
    (when new-install
      (log/info "Looks like this is a new installation ... preparing setup wizard")
      ;; create setup token
      (create-setup-token!)
      ;; publish install event
      (events/publish-event :install {}))
    (reset! metabase-initialization-progress 0.9)

    ;; deal with our sample dataset as needed
    (if new-install
      ;; add the sample dataset DB for fresh installs
      (sample-data/add-sample-dataset!)
      ;; otherwise update if appropriate
      (sample-data/update-sample-dataset-if-needed!)))

  (initialization-complete!)
  (log/info "Metabase Initialization COMPLETE"))


;;; ## ---------------------------------------- Normal Start ----------------------------------------

(def ^:private jetty-instance (promise))

(defn- start-jetty! []
  (future
    (try
      (u/thread-safe-require 'metabase.handler)
      (deliver jetty-instance ((resolve 'metabase.handler/start-jetty!)))
      (catch Throwable e
        (deliver jetty-instance e)))))

(defn- join-jetty-server!
  "Block forever while Jetty does its thing, or throw an Exception if Jetty startup failed."
  []
  (when (config/config-bool :mb-jetty-join)
    (let [instance (deref jetty-instance 5000 :timeout)]
      (cond
        (instance? Throwable instance) (throw instance)
        (= instance :timeout)          (throw (Exception. "Jetty server failed to start after 5 seconds."))
        :else                          (.join ^Server instance)))))

(set! *warn-on-reflection* true)

(defn- start-normally []
  (log/info "Starting Metabase in STANDALONE mode")
  (try
    (start-jetty!)
    (init!)
    (join-jetty-server!)
    ;; handle any errors starting up :'(
    (catch Throwable e
      (.printStackTrace e)
      (log/error "Metabase Initialization FAILED: " (.getMessage e))
      (System/exit 1))))


;;; ---------------------------------------- Special Commands ----------------------------------------

(defn ^:command migrate
  "Run database migrations. Valid options for DIRECTION are `up`, `force`, `down-one`, `print`, or `release-locks`."
  [direction]
  (db/migrate! @db/db-connection-details (keyword direction)))

(defn ^:command load-from-h2
  "Transfer data from existing H2 database to the newly created MySQL or Postgres DB specified by env vars."
  ([]
   (load-from-h2 nil))
  ([h2-connection-string]
   (u/thread-safe-require 'metabase.cmd.load-from-h2)
   ((resolve 'metabase.cmd.load-from-h2/load-from-h2!) h2-connection-string)))

(defn ^:command profile
  "Start Metabase the usual way and exit. Useful for profiling Metabase launch time."
  []
  ;; override env var that would normally make Jetty block forever
  (u/thread-safe-require 'environ.core)
  (intern 'environ.core 'env (assoc environ.core/env :mb-jetty-join "false"))
  (start-normally))

(defn ^:command help
  "Show this help message listing valid Metabase commands."
  []
  (println "Valid commands are:")
  (doseq [[symb varr] (sort (ns-interns 'metabase.core))
          :when       (:command (meta varr))]
    (println symb (s/join " " (:arglists (meta varr))))
    (println "\t" (:doc (meta varr)))))

(defn- cmd->fn [command-name]
  (or (when (seq command-name)
        (when-let [varr (ns-resolve 'metabase.core (symbol command-name))]
          (when (:command (meta varr))
            @varr)))
      (do (println (u/format-color 'red "Unrecognized command: %s" command-name))
          (help)
          (System/exit 1))))

(defn- run-cmd [cmd & args]
  (try (apply (cmd->fn cmd) args)
       (catch Throwable e
         (.printStackTrace e)
         (println (u/format-color 'red "Command failed with exception: %s" (.getMessage e)))
         (System/exit 1)))
  (System/exit 0))


;;; ---------------------------------------- App Entry Point ----------------------------------------

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (if cmd
    (apply run-cmd cmd args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally)))       ; with no command line args just start Metabase normally
