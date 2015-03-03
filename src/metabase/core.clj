(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            (ring.middleware [cookies :refer [wrap-cookies]]
                             [json :refer [wrap-json-response
                                           wrap-json-body]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])
            (metabase.middleware [auth :as auth]
                                 [log-api-call :refer :all]
                                 [format :refer :all])
            [metabase.routes :as routes]
            [metabase.db :as db]))

(defn liquibase-sql []
  (db/migrate :up))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (liquibase-sql))

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
