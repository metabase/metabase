;; -*- comment-column: 35; -*-
(ns metabase.core
  (:gen-class)
  (:require [cheshire.core :as json]
            [clojure.pprint :as pprint]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [config :as config]
             [db :as mdb]
             [driver :as driver]
             [events :as events]
             [metabot :as metabot]
             [middleware :as mb-middleware]
             [plugins :as plugins]
             [routes :as routes]
             [sample-data :as sample-data]
             [setup :as setup]
             [task :as task]
             [util :as u]]
            [metabase.core.initialization-status :as init-status]
            [metabase.models
             [setting :as setting]
             [user :refer [User]]]
            [metabase.util.i18n :refer [set-locale]]
            [puppetlabs.i18n.core :refer [locale-negotiator]]
            [ring.adapter.jetty :as ring-jetty]
            [ring.middleware
             [cookies :refer [wrap-cookies]]
             [gzip :refer [wrap-gzip]]
             [json :refer [wrap-json-body]]
             [keyword-params :refer [wrap-keyword-params]]
             [params :refer [wrap-params]]
             [session :refer [wrap-session]]]
            [ring.util
             [io :as rui]
             [response :as rr]]
            [toucan.db :as db]
            [metabase.public-settings :as public-settings]
            [metabase.models.user :refer [User], :as user])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           [java.nio.charset Charset StandardCharsets]
           org.eclipse.jetty.server.Server
           org.eclipse.jetty.util.thread.QueuedThreadPool))

;;; CONFIG

;; TODO - why not just put this in `metabase.middleware` with *all* of our other custom middleware. Also, what's the
;; difference between this and `streaming-json-response`?
(defn- streamed-json-response
  "Write `RESPONSE-SEQ` to a PipedOutputStream as JSON, returning the connected PipedInputStream"
  [response-seq options]
  (rui/piped-input-stream
   (fn [^OutputStream output-stream]
     (with-open [output-writer   (OutputStreamWriter. ^OutputStream output-stream ^Charset StandardCharsets/UTF_8)
                 buffered-writer (BufferedWriter. output-writer)]
       (json/generate-stream response-seq buffered-writer)))))

(defn- wrap-streamed-json-response
  "Similar to ring.middleware/wrap-json-response in that it will serialize the response's body to JSON if it's a
  collection. Rather than generating a string it will stream the response using a PipedOutputStream.

  Accepts the following options (same as `wrap-json-response`):

  :pretty            - true if the JSON should be pretty-printed
  :escape-non-ascii  - true if non-ASCII characters should be escaped with \\u"
  [handler & [{:as opts}]]
  (fn [request]
    (let [response (handler request)]
      (if-let [json-response (and (coll? (:body response))
                                  (update-in response [:body] streamed-json-response opts))]
        (if (contains? (:headers json-response) "Content-Type")
          json-response
          (rr/content-type json-response "application/json; charset=utf-8"))
        response))))

(def ^:private jetty-instance
  (atom nil))

(defn- jetty-stats []
  (when-let [^Server jetty-server @jetty-instance]
    (let [^QueuedThreadPool pool (.getThreadPool jetty-server)]
      {:min-threads  (.getMinThreads pool)
       :max-threads  (.getMaxThreads pool)
       :busy-threads (.getBusyThreads pool)
       :idle-threads (.getIdleThreads pool)
       :queue-size   (.getQueueSize pool)})))

(def ^:private app
  "The primary entry point to the Ring HTTP server."
  (-> #'routes/routes                    ; the #' is to allow tests to redefine endpoints
      (mb-middleware/log-api-call
       jetty-stats)
      mb-middleware/add-security-headers ; Add HTTP headers to API responses to prevent them from being cached
      (wrap-json-body                    ; extracts json POST body and makes it avaliable on request
        {:keywords? true})
      wrap-streamed-json-response        ; middleware to automatically serialize suitable objects as JSON in responses
      wrap-keyword-params                ; converts string keys in :params to keyword keys
      wrap-params                        ; parses GET and POST params as :query-params/:form-params and both as :params
      mb-middleware/bind-current-user    ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
      mb-middleware/wrap-current-user-id ; looks for :metabase-session-id and sets :metabase-user-id if Session ID is valid
      mb-middleware/wrap-api-key         ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
      mb-middleware/wrap-session-id      ; looks for a Metabase Session ID and assoc as :metabase-session-id
      mb-middleware/maybe-set-site-url   ; set the value of `site-url` if it hasn't been set yet
      locale-negotiator                  ; Binds *locale* for i18n
      wrap-cookies                       ; Parses cookies in the request map and assocs as :cookies
      wrap-session                       ; reads in current HTTP session and sets :session/key
      wrap-gzip))                        ; GZIP response if client can handle it


;;; ## ---------------------------------------- LIFECYCLE ----------------------------------------



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
  (init-status/set-progress! 0.1)

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy!))
  (init-status/set-progress! 0.2)

  ;; load any plugins as needed
  (plugins/load-plugins!)
  (init-status/set-progress! 0.3)

  ;; Load up all of our Database drivers, which are used for app db work
  (driver/find-and-load-drivers!)
  (init-status/set-progress! 0.4)

  ;; startup database.  validates connection & runs any necessary migrations
  (log/info "Setting up and migrating Metabase DB. Please sit tight, this may take a minute...")
  (mdb/setup-db! :auto-migrate (config/config-bool :mb-db-automigrate))
  (init-status/set-progress! 0.5)

  ;; TODO romartin:
  (let [new-install? (not (db/exists? User))]
    (if new-install?
      (when (public-settings/init-admin-user)
            (let [ new-user (db/insert! User
                                        :email        (public-settings/init-admin-mail)
                                        :first_name   (public-settings/init-admin-user)
                                        :last_name    (public-settings/init-admin-user)
                                        :password     (str (java.util.UUID/randomUUID))
                                        :is_superuser true)]
              ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
              (user/set-password! (:id new-user) (public-settings/init-admin-password))))))

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
      (log/info "Looks like this is a new installation ... preparing setup wizard")
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
  (log/info "Metabase Initialization COMPLETE"))


;;; ## ---------------------------------------- Jetty (Web) Server ----------------------------------------

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
      (log/info "Launching Embedded Jetty Webserver with config:\n" (with-out-str (pprint/pprint (m/filter-keys #(not (re-matches #".*password.*" (str %)))
                                                                                                                jetty-config))))
      ;; NOTE: we always start jetty w/ join=false so we can start the server first then do init in the background
      (->> (ring-jetty/run-jetty app (assoc jetty-config :join? false))
           (reset! jetty-instance)))))

(defn stop-jetty!
  "Stop the embedded Jetty web server."
  []
  (when @jetty-instance
    (log/info "Shutting Down Embedded Jetty Webserver")
    (.stop ^Server @jetty-instance)
    (reset! jetty-instance nil)))

(defn- wrap-with-asterisk [strings-to-wrap]
  ;; Adding 4 extra asterisks so that we account for the leading asterisk and space, and add two more after the end of the sentence
  (let [string-length (+ 4 (apply max (map count strings-to-wrap)))]
    (str (apply str (repeat string-length \* ))
         "\n"
         "*\n"
         (apply str (map #(str "* " % "\n") strings-to-wrap))
         "*\n"
         (apply str (repeat string-length \* )))))

(defn- check-jdk-version []
  (let [java-spec-version (System/getProperty "java.specification.version")]
    ;; Note for java 7, this is 1.7, but newer versions drop the 1. Java 9 just returns "9" here.
    (when (= "1.7" java-spec-version)
      (let [java-version (System/getProperty "java.version")
            deprecation-messages [(str "DEPRECATION WARNING: You are currently running JDK '" java-version "'. "
                                       "Support for Java 7 has been deprecated and will be dropped from a future release.")
                                  (str "See the operation guide for more information: https://metabase.com/docs/latest/operations-guide/start.html.")]]
        (binding [*out* *err*]
          (println (wrap-with-asterisk deprecation-messages))
          (log/warn deprecation-messages))))))

;;; ## ---------------------------------------- Normal Start ----------------------------------------

(defn- start-normally []
  (log/info "Starting Metabase in STANDALONE mode")
  (try
    (check-jdk-version)
    ;; launch embedded webserver async
    (start-jetty!)
    ;; run our initialization process
    (init!)
    ;; Ok, now block forever while Jetty does its thing
    (when (config/config-bool :mb-jetty-join)
      (.join ^Server @jetty-instance))
    (catch Throwable e
      (.printStackTrace e)
      (log/error "Metabase Initialization FAILED: " (.getMessage e))
      (System/exit 1))))

(defn- run-cmd [cmd args]
  (require 'metabase.cmd)
  ((resolve 'metabase.cmd/run-cmd) cmd args))


;;; ---------------------------------------- App Entry Point ----------------------------------------

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (if cmd
    (run-cmd cmd args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally))) ; with no command line args just start Metabase normally
