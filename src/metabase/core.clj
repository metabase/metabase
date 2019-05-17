;; -*- comment-column: 35; -*-
(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
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
             [util :as u]]
            [metabase.core.initialization-status :as init-status]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [setting :as setting]
             [user :refer [User]]]
            [metabase.util.i18n :refer [set-locale trs]]
            [toucan.db :as db]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

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
    (log/info (u/format-color 'green
                  (str (trs "Please use the following URL to setup your Metabase installation:")
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
  (log/info (trs "System timezone is ''{0}'' ..." (System/getProperty "user.timezone")))
  (init-status/set-progress! 0.1)

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
  (init-status/set-progress! 0.2)

  ;; load any plugins as needed
  (plugins/load-plugins!)
  (init-status/set-progress! 0.3)

  ;; Load up all of our Database drivers, which are used for app db work
  (driver.u/find-and-load-all-drivers!)
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

  (set-locale (setting/get :site-locale))

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
  (require 'metabase.cmd)
  ((resolve 'metabase.cmd/run-cmd) cmd args))


;;; ------------------------------------------------ App Entry Point -------------------------------------------------

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (if cmd
    (run-cmd cmd args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally))) ; with no command line args just start Metabase normally
