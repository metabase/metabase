(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [medley.core :as medley]
            [metabase.config :as config]
            [metabase.db :as db]
            (metabase.middleware [auth :as auth]
                                 [log-api-call :refer :all]
                                 [format :refer :all])
            [metabase.models.user :refer [User]]
            [metabase.routes :as routes]
            [metabase.setup :as setup]
            [ring.adapter.jetty :as ring-jetty]
            (ring.middleware [cookies :refer [wrap-cookies]]
                             [gzip :refer [wrap-gzip]]
                             [json :refer [wrap-json-response
                                           wrap-json-body]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])))


(def app
  "The primary entry point to the HTTP server"
  (-> routes/routes
      (log-api-call :request)
      format-response         ; [METABASE] Do formatting before converting to JSON so serializer doesn't barf
      wrap-json-response      ; middleware to automatically serialize suitable objects as JSON in responses
      (wrap-json-body         ; extracts json POST body and makes it avaliable on request
        {:keywords? true})
      wrap-keyword-params     ; converts string keys in :params to keyword keys
      wrap-params             ; parses GET and POST params as :query-params/:form-params and both as :params
      auth/wrap-sessionid     ; looks for a Metabase sessionid and assocs as :metabase-sessionid
      wrap-cookies            ; Parses cookies in the request map and assocs as :cookies
      wrap-session            ; reads in current HTTP session and sets :session/key
      wrap-gzip))             ; GZIP response if client can handle it


(defn init
  "General application initialization function which should be run once at application startup."
  []
  (log/info "Metabase Initializing ... ")
  (log/debug "Using Config:\n" (with-out-str (clojure.pprint/pprint config/config-all)))

  ;; startup database.  validates connection & runs any necessary migrations
  (db/setup-db :auto-migrate (config/config-bool :mb-db-automigrate))

  ;; run a very quick check to see if we are doing a first time installation
  ;; the test we are using is if there is at least 1 User in the database
  (when-not (db/sel :one :fields [User :id])
    (log/info "Looks like this is a new installation ... preparing setup wizard")
    (let [setup-token (setup/token-create)
          hostname (or (config/config-str :mb-jetty-host) "localhost")
          port (config/config-int :mb-jetty-port)
          setup-url (str "http://"
                      (or hostname "localhost")
                      (when-not (= 80 port) (str ":" port))
                      "/setup/"
                      setup-token)]
      (log/info (str "Please use the following url to setup your Metabase installation:\n\n"
                  setup-url
                  "\n\n"))))

  (log/info "Metabase Initialization COMPLETE")
  true)


(defn -main
  "Launch Metabase in standalone mode."
  [& args]
  (log/info "Starting Metabase in STANDALONE mode")

  ;; run application init and if there are no issues then continue on to launching the webserver
  (when (try
          (init)
          (catch Exception e
            (log/error "Metabase Initialization FAILED: " (.getMessage e))))
    ;; startup webserver
    (let [jetty-config (->> {:port (config/config-int :mb-jetty-port)
                             :host (config/config-str :mb-jetty-host)
                             :join? (config/config-bool :mb-jetty-join?)
                             :daemon? (config/config-bool :mb-jetty-daemon?)
                             :max-threads (config/config-int :mb-jetty-maxthreads)
                             :min-threads (config/config-int :mb-jetty-minthreads)
                             :max-queued (config/config-int :mb-jetty-maxqueued)
                             :max-idle-time (config/config-int :mb-jetty-maxidletime)}
                         (medley/filter-vals identity))]
      (log/info "Launching Embedded Jetty Webserver with config:\n" (with-out-str (clojure.pprint/pprint jetty-config)))
      (ring-jetty/run-jetty app jetty-config))))
