(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [medley.core :as medley]
            [metabase.config :as config]
            [metabase.db :as db]
            (metabase.middleware [auth :as auth]
                                 [log-api-call :refer :all]
                                 [format :refer :all])
            [metabase.routes :as routes]
            [metabase.util :as util]
            [ring.adapter.jetty :as ring-jetty]
            (ring.middleware [cookies :refer [wrap-cookies]]
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
      ))


(defn init
  "General application initialization function which should be run once at application startup."
  []
  (log/info "Metabase Initializing ... ")

  ;; startup database.  validates connection & runs any necessary migrations
  ;; TODO - allow for env configuration regarding migrations process
  (db/setup true)

  (log/info "Metabase Initialization COMPLETE"))


(defn -main
  "Launch Metabase in standalone mode."
  [& args]
  (log/info "Launching Metabase in STANDALONE mode")

  ;; run our main initialization function
  (init)

  ;; startup webserver
  ;; TODO - allow for env configuration
  (let [jetty-config {:port 3000}]
    (ring-jetty/run-jetty app jetty-config)))