(ns metabase.core
  (:gen-class)
  (:require [clojure.string :as str]
            [clojure.tools
             [logging :as log]
             [trace :as trace]]
            [metabase
             [config :as config]
             [db :as mdb]
             [events :as events]
             [handler :as handler]
             [metabot :as metabot]
             [plugins :as plugins]
             [sample-data :as sample-data]
             [server :as server]
             [setup :as setup]
             [task :as task]
             [troubleshooting :as troubleshooting]
             [util :as u]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models.user :refer [User]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util.i18n :refer [deferred-trs trs]]
            [toucan.db :as db]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(defn- -init-create-setup-token
  "Create and set a new setup token and log it."
  []
  (setup/create-token!)                    ; we need this here to create the initial token
  (let [hostname  (or (config/config-str :mb-jetty-host) "localhost")
        port      (config/config-int :mb-jetty-port)
        setup-url (str "http://"
                       (or hostname "localhost")
                       (when-not (= 80 port) (str ":" port))
                       "/setup/")]
    (log/info (u/format-color 'green
                              (str (deferred-trs "Please use the following URL to setup your Metabase installation:")
                                   "\n\n"
                                   setup-url
                                   "\n\n")))))

(defn- destroy!
  "General application shutdown function which should be called once at application shuddown."
  []
  (log/info (trs "Metabase Shutting Down ..."))
  ;; TODO - it would really be much nicer if we implemented a basic notification system so these things could listen
  ;; to a Shutdown hook of some sort instead of having here
  (task/stop-scheduler!)
  (server/stop-web-server!)
  (log/info (trs "Metabase Shutdown COMPLETE")))

(defn init!
  "General application initialization function which should be run once at application startup."
  []
  (log/info (trs "Starting Metabase version {0} ..." config/mb-version-string))
  (log/info (trs "System info:\n {0}" (u/pprint-to-str (troubleshooting/system-info))))
  (init-status/set-progress! 0.1)

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
  (init-status/set-progress! 0.2)

  ;; load any plugins as needed
  (plugins/load-plugins!)
  (init-status/set-progress! 0.3)

  ;; Load up the drivers shipped as part of the main codebase, so they will show up in the list of available DB types
  (classloader/require 'metabase.driver.h2 'metabase.driver.postgres 'metabase.driver.mysql)
  (init-status/set-progress! 0.4)

  ;; startup database.  validates connection & runs any necessary migrations
  (log/info (trs "Setting up and migrating Metabase DB. Please sit tight, this may take a minute..."))
  (mdb/setup-db!)
  (init-status/set-progress! 0.5)

  ;; run a very quick check to see if we are doing a first time installation
  ;; the test we are using is if there is at least 1 User in the database
  (let [new-install? (not (db/exists? User))]

    ;; Bootstrap the event system
    (events/initialize-events!)
    (init-status/set-progress! 0.7)

    ;; Now start the task runner
    (task/start-scheduler!)
    (init-status/set-progress! 0.8)

    (when new-install?
      (log/info (trs "Looks like this is a new installation ... preparing setup wizard"))
      ;; create setup token
      (-init-create-setup-token)
      ;; publish install event
      (events/publish-event! :install {}))
    (init-status/set-progress! 0.9)

    ;; deal with our sample dataset as needed
    (if new-install?
      ;; add the sample dataset DB for fresh installs
      (sample-data/add-sample-dataset!)
      ;; otherwise update if appropriate
      (sample-data/update-sample-dataset-if-needed!))

    ;; start the metabot thread
    (metabot/start-metabot!))

  (init-status/set-complete!)
  (log/info (trs "Metabase Initialization COMPLETE")))

;;; -------------------------------------------------- Normal Start --------------------------------------------------

(defn- start-normally []
  (log/info (trs "Starting Metabase in STANDALONE mode"))
  (try
    ;; launch embedded webserver async
    (server/start-web-server! handler/app)
    ;; run our initialization process
    (init!)
    ;; Ok, now block forever while Jetty does its thing
    (when (config/config-bool :mb-jetty-join)
      (.join (server/instance)))
    (catch Throwable e
      (log/error e (trs "Metabase Initialization FAILED"))
      (System/exit 1))))

(defn- run-cmd [cmd args]
  (classloader/require 'metabase.cmd)
  ((resolve 'metabase.cmd/run-cmd) cmd args))

;;; -------------------------------------------------- Tracing -------------------------------------------------------

(defn- maybe-enable-tracing
  []
  (log/warn (trs "WARNING: You have enabled namespace tracing, which could log sensitive information like db passwords."))
  (let [mb-trace-str (config/config-str :mb-ns-trace)]
    (when (not-empty mb-trace-str)
      (doseq [namespace (map symbol (str/split mb-trace-str #",\s*"))]
        (try (require namespace)
             (catch Throwable _
               (throw (ex-info "A namespace you specified with MB_NS_TRACE could not be required" {:namespace namespace}))))
        (trace/trace-ns namespace)))))

;;; ------------------------------------------------ App Entry Point -------------------------------------------------

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (maybe-enable-tracing)
  (if cmd
    (run-cmd cmd args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally))) ; with no command line args just start Metabase normally
