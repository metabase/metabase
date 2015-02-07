(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            (ring.middleware [cookies :refer [wrap-cookies]]
                             [json :refer [wrap-json-response]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])
            (metabase.middleware [current-user :refer :all]
                                 [log-api-call :refer :all]
                                 [strip-fns-from-response :refer :all])
            [metabase.routes :as routes]))

(defn liquibase-sql []
  (let [conn (jdbc/get-connection {:subprotocol "postgresql"
                                   :subname "//localhost:15432/corvus_test"
                                   :user "corvus"
                                   :password "corvus"})]
    (com.metabase.corvus.migrations.LiquibaseMigrations/genSqlDatabase conn)))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (liquibase-sql))

(def app
  "The primary entry point to the HTTP server"
  (-> routes/routes
      (log-api-call :request)
      strip-fns-from-response ; [METABASE] Pull out fns in response so JSON serializer doesn't barf
      wrap-json-response      ; middleware to automatically serialize suitable objects as JSON in responses
      wrap-keyword-params     ; converts string keys in :params to keyword keys
      wrap-params             ; parses GET and POST params as :query-params/:form-params and both as :params
      bind-current-user       ; [METABASE] associate :current-user-id and :current-user with request
      wrap-cookies            ; Parses cookies in the request map and assocs as :cookies
      wrap-session            ; reads in current HTTP session and sets :session/key
      ))
