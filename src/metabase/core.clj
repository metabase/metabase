(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.middleware.json :refer [wrap-json-response]]
            [ring.util.response :as resp]))

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

;; placeholder until we actually define real API routes
(defroutes api-routes
  ;; call /api/test to see this
  (GET "/test" [] {:status 200 :body {:message "We can serialize JSON <3"}}))

(letfn [(serve-index [_] (resp/file-response "frontend_client/index.html"))]
  (defroutes routes
    (GET "/" [] serve-index)                            ; ^/$    -> index.html
    (context "/api" [] api-routes)                      ; ^/api/ -> API routes
    (route/files "/app/" {:root "frontend_client/app"}) ; ^/app/ -> static files under frontend_client/app
    (route/not-found serve-index)))                     ; Anything else (e.g. /user/edit_current) should serve up index.html; Angular app will handle the rest

(def app
  "The primary entry point to the HTTP server"
  (-> routes
      wrap-json-response      ; middleware to automatically serialize suitable objects as JSON in responses
      ))
