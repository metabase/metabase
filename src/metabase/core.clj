;; -*- comment-column: 35; -*-
(ns metabase.core
  (:gen-class)
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
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
                      [events :as events]
                      [middleware :as mb-middleware]
                      [routes :as routes]
                      [sample-data :as sample-data]
                      [setup :as setup]
                      [task :as task]
                      [util :as u])
            (metabase.models [setting :refer [defsetting]]
                             [database :refer [Database]]
                             [user :refer [User]])))

;; ## CONFIG

(defsetting site-name "The name used for this instance of Metabase." "Metabase")

(defsetting -site-url "The base URL of this Metabase instance, e.g. \"http://metabase.my-company.com\"")

(defsetting anon-tracking-enabled "Enable the collection of anonymous usage data in order to help Metabase improve." "true")

(defn site-url
  "Fetch the site base URL that should be used for password reset emails, etc.
   This strips off any trailing slashes that may have been added.

   The first time this function is called, we'll set the value of the setting `-site-url` with the value of
   the ORIGIN header (falling back to HOST if needed, i.e. for unit tests) of some API request.
   Subsequently, the site URL can only be changed via the admin page."
  {:arglists '([request])}
  [{{:strs [origin host]} :headers}]
  {:pre  [(or origin host)]
   :post [(string? %)]}
  (or (some-> (-site-url)
              (s/replace #"/$" "")) ; strip off trailing slash if one was included
      (-site-url (or origin host))))

(def app
  "The primary entry point to the HTTP server"
  (-> routes/routes
      (mb-middleware/log-api-call :request :response)
      mb-middleware/add-security-headers              ; [METABASE] Add HTTP headers to API responses to prevent them from being cached
      mb-middleware/format-response                   ; [METABASE] Do formatting before converting to JSON so serializer doesn't barf
      (wrap-json-body                                 ; extracts json POST body and makes it avaliable on request
        {:keywords? true})
      wrap-json-response                              ; middleware to automatically serialize suitable objects as JSON in responses
      wrap-keyword-params                             ; converts string keys in :params to keyword keys
      wrap-params                                     ; parses GET and POST params as :query-params/:form-params and both as :params
      mb-middleware/bind-current-user                 ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
      mb-middleware/wrap-current-user-id              ; looks for :metabase-session-id and sets :metabase-user-id if Session ID is valid
      mb-middleware/wrap-api-key                      ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
      mb-middleware/wrap-session-id                   ; looks for a Metabase Session ID and assoc as :metabase-session-id
      wrap-cookies                                    ; Parses cookies in the request map and assocs as :cookies
      wrap-session                                    ; reads in current HTTP session and sets :session/key
      wrap-gzip))                                     ; GZIP response if client can handle it


;;; ## ---------------------------------------- LIFECYCLE ----------------------------------------

(def ^:private metabase-initialization-progress
  (atom 0))

(defn initialized?
  "Metabase is initialized and ready to be served"
  []
  (= @metabase-initialization-progress 1.0))

(defn initialization-progress
  "Get the current progress of the Metabase initialize"
  []
  @metabase-initialization-progress)

(defn initialization-complete!
  "Complete the Metabase initialization by setting its progress to 100%"
  []
  (reset! metabase-initialization-progress 1.0))

(defn- -init-create-setup-token
  "Create and set a new setup token, and open the setup URL on the user's system."
  []
  (let [setup-token (setup/token-create)                    ; we need this here to create the initial token
        hostname    (or (config/config-str :mb-jetty-host) "localhost")
        port        (config/config-int :mb-jetty-port)
        setup-url   (str "http://"
                         (or hostname "localhost")
                         (when-not (= 80 port) (str ":" port))
                         "/setup/")]
    (log/info (color/green "Please use the following url to setup your Metabase installation:\n\n"
                           setup-url
                           "\n\n"))))

(defn destroy
  "General application shutdown function which should be called once at application shuddown."
  []
  (log/info "Metabase Shutting Down ...")
  (task/stop-scheduler!)
  (log/info "Metabase Shutdown COMPLETE"))

(defn init
  "General application initialization function which should be run once at application startup."
  []
  (log/info (format "Starting Metabase version %s..." (config/mb-version-string)))
  (reset! metabase-initialization-progress 0.1)

  ;; First of all, lets register a shutdown hook that will tidy things up for us on app exit
  (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable destroy))
  (reset! metabase-initialization-progress 0.3)

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
      (sample-data/update-sample-dataset-if-needed!)))

  (log/info "Metabase Initialization COMPLETE")
  (initialization-complete!)
  true)


;;; ## ---------------------------------------- Jetty (Web) Server ----------------------------------------


(def ^:private jetty-instance
  (atom nil))

(defn start-jetty
  "Start the embedded Jetty web server."
  []
  (when-not @jetty-instance
    (let [jetty-config (cond-> (m/filter-vals identity {:port (config/config-int :mb-jetty-port)
                                                        :host (config/config-str :mb-jetty-host)
                                                        :max-threads (config/config-int :mb-jetty-maxthreads)
                                                        :min-threads (config/config-int :mb-jetty-minthreads)
                                                        :max-queued (config/config-int :mb-jetty-maxqueued)
                                                        :max-idle-time (config/config-int :mb-jetty-maxidletime)})
                         (config/config-str :mb-jetty-join) (assoc :join? (config/config-bool :mb-jetty-join))
                         (config/config-str :mb-jetty-daemon) (assoc :daemon? (config/config-bool :mb-jetty-daemon)))]
      (log/info "Launching Embedded Jetty Webserver with config:\n" (with-out-str (clojure.pprint/pprint jetty-config)))
      (->> (ring-jetty/run-jetty app jetty-config)
           (reset! jetty-instance)))))

(defn stop-jetty
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
    (start-jetty)
    ;; run our initialization process
    (init)
    ;; Ok, now block forever while Jetty does its thing
    (.join ^org.eclipse.jetty.server.Server @jetty-instance)
    (catch Exception e
      (.printStackTrace e)
      (log/error "Metabase Initialization FAILED: " (.getMessage e)))))

(defn- run-cmd [cmd & args]
  (let [cmd->fn {:migrate (fn [direction]
                            (db/migrate (keyword direction)))}]
    (if-let [f (cmd->fn cmd)]
      (do (apply f args)
          (println "Success.")
          (System/exit 0))
      (do (println "Unrecognized command:" (name cmd))
          (println "Valid commands are:\n" (u/pprint-to-str (map name (keys cmd->fn))))
          (System/exit 1)))))

(defn -main
  "Launch Metabase in standalone mode."
  [& [cmd & args]]
  (if cmd
    (apply run-cmd (keyword cmd) args) ; run a command like `java -jar metabase.jar migrate release-locks` or `lein run migrate release-locks`
    (start-normally)))                 ; with no command line args just start Metabase normally
