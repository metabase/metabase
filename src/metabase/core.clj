(ns metabase.core
  (:gen-class)
  (:require [clojure.tools.logging :as log]
            (ring.middleware [json :refer [wrap-json-response]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [nested-params :refer [wrap-nested-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])
            [metabase.auth :as auth]
            [metabase.routes :as routes]))

(defn -main
  "I don't do a whole lot ... yet."
  [& args]
  (println "Hello, World!")
  (log/info "testing logging"))

(def app
  "The primary entry point to the HTTP server"
  (-> routes/routes
      auth/auth-middleware
      wrap-keyword-params
      wrap-nested-params
      wrap-params
      wrap-session
      wrap-json-response      ; middleware to automatically serialize suitable objects as JSON in responses
      ))
