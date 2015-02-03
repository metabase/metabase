(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [context defroutes GET]]
            [compojure.route :as route]
            [ring.middleware.json :refer [wrap-json-response]]))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (println "Hello, World!")
  (log/info "testing logging"))

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
