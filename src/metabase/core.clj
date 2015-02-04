(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.middleware.json :refer [wrap-json-response]]))

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

(defn first-element [sequence default]
  (or (first sequence) default))

(defroutes routes
  (GET "/" [] "Success!")
  (GET "/test.json" [] {:status 200
                        :body {:message "We can serialize JSON <3"}})
  (route/not-found "404 :/"))

(def app
  "The primary entry point to the HTTP server"
  (-> routes
      wrap-json-response      ; middleware to automatically serialize suitable objects as JSON in responses
      ))
