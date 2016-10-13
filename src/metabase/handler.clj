(ns metabase.handler
  "Metabase Ring app handler."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [ring.adapter.jetty :as ring-jetty]
            (ring.middleware [cookies :refer [wrap-cookies]]
                             [gzip :refer [wrap-gzip]]
                             [json :refer [wrap-json-response
                                           wrap-json-body]]
                             [keyword-params :refer [wrap-keyword-params]]
                             [params :refer [wrap-params]]
                             [session :refer [wrap-session]])
            (metabase [config :as config]
                      [middleware :as mb-middleware]
                      logger
                      [routes :as routes]
                      [util :as u]))
  (:import org.eclipse.jetty.server.Server))

(def ^:private handler
  "The primary entry point to the Ring HTTP server."
  (-> routes/routes
      mb-middleware/log-api-call
      mb-middleware/add-security-headers ; Add HTTP headers to API responses to prevent them from being cached
      (wrap-json-body                    ; extracts json POST body and makes it avaliable on request
        {:keywords? true})
      wrap-json-response                 ; middleware to automatically serialize suitable objects as JSON in responses
      wrap-keyword-params                ; converts string keys in :params to keyword keys
      wrap-params                        ; parses GET and POST params as :query-params/:form-params and both as :params
      mb-middleware/bind-current-user    ; Binds *current-user* and *current-user-id* if :metabase-user-id is non-nil
      mb-middleware/wrap-current-user-id ; looks for :metabase-session-id and sets :metabase-user-id if Session ID is valid
      mb-middleware/wrap-api-key         ; looks for a Metabase API Key on the request and assocs as :metabase-api-key
      mb-middleware/wrap-session-id      ; looks for a Metabase Session ID and assoc as :metabase-session-id
      wrap-cookies                       ; Parses cookies in the request map and assocs as :cookies
      wrap-session                       ; reads in current HTTP session and sets :session/key
      wrap-gzip))                        ; GZIP response if client can handle it


(def ^:private jetty-config
  (delay (m/filter-vals (complement nil?)
                        (merge {:port          (config/config-int :mb-jetty-port)
                                :host          (config/config-str :mb-jetty-host)
                                :max-threads   (config/config-int :mb-jetty-maxthreads)
                                :min-threads   (config/config-int :mb-jetty-minthreads)
                                :max-queued    (config/config-int :mb-jetty-maxqueued)
                                :max-idle-time (config/config-int :mb-jetty-maxidletime)
                                :daemon?       (config/config-bool :mb-jetty-daemon)}
                               (when (config/config-bool :mb-jetty-ssl)
                                 {:ssl?           true
                                  :ssl-port       (config/config-int :mb-jetty-ssl-port)
                                  :keystore       (config/config-str :mb-jetty-ssl-keystore)
                                  :key-password   (config/config-str :mb-jetty-ssl-keystore-password)
                                  :truststore     (config/config-str :mb-jetty-ssl-truststore)
                                  :trust-password (config/config-str :mb-jetty-ssl-truststore-password)})))))


(def ^:private jetty-instance
  (atom nil))

(defn start-jetty!
  "Start the embedded Jetty web server. Returns the Jetty instance."
  ^org.eclipse.jetty.server.Server []
  (when-not @jetty-instance
    (log/info "Launching Embedded Jetty Webserver with config:\n" (u/pprint-to-str (m/filter-keys #(not (re-matches #".*password.*" (str %)))
                                                                                                  @jetty-config)))
    ;; NOTE: we always start jetty w/ join=false so we can start the server first then do init in the background
    (u/prog1 (ring-jetty/run-jetty handler (assoc @jetty-config :join? false))
      (.setStopAtShutdown <> true)
      (reset! jetty-instance <>))))

(defn stop-jetty!
  "Stop the embedded Jetty web server."
  []
  (when @jetty-instance
    (log/info "Shutting Down Embedded Jetty Webserver")
    (.stop ^Server @jetty-instance)
    (reset! jetty-instance nil)))
