(ns metabase.server
  "Code related to configuring, starting, and stopping the Metabase Jetty web server."
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.server.protocols :as server.protocols]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [ring.adapter.jetty :as ring-jetty]
   [ring.util.jakarta.servlet :as servlet])
  (:import
   (jakarta.servlet AsyncContext)
   (jakarta.servlet.http HttpServletRequest HttpServletResponse)
   (org.eclipse.jetty.server Request Server)
   (org.eclipse.jetty.server.handler AbstractHandler StatisticsHandler)))

(set! *warn-on-reflection* true)

(defn- jetty-ssl-config []
  (m/filter-vals
   some?
   {:ssl-port        (config/config-int :mb-jetty-ssl-port)
    :keystore        (config/config-str :mb-jetty-ssl-keystore)
    :key-password    (config/config-str :mb-jetty-ssl-keystore-password)
    :truststore      (config/config-str :mb-jetty-ssl-truststore)
    :trust-password  (config/config-str :mb-jetty-ssl-truststore-password)
    :client-auth     (when (config/config-bool :mb-jetty-ssl-client-auth)
                       :need)
    :sni-host-check? (when (config/config-str :mb-jetty-skip-sni)
                       false)}))

(defn- jetty-config []
  (cond-> (m/filter-vals
           some?
           {:port          (config/config-int :mb-jetty-port)
            :host          (config/config-str :mb-jetty-host)
            :max-threads   (config/config-int :mb-jetty-maxthreads)
            :min-threads   (config/config-int :mb-jetty-minthreads)
            :max-queued    (config/config-int :mb-jetty-maxqueued)
            :max-idle-time (config/config-int :mb-jetty-maxidletime)})
    (config/config-int :mb-jetty-request-header-size) (assoc :request-header-size (config/config-int
                                                                                    :mb-jetty-request-header-size))
    (config/config-str :mb-jetty-daemon) (assoc :daemon? (config/config-bool :mb-jetty-daemon))
    (config/config-str :mb-jetty-ssl)    (-> (assoc :ssl? true)
                                             (merge (jetty-ssl-config)))))

(defn- log-config [jetty-config]
  (log/info "Launching Embedded Jetty Webserver with config:\n"
            (u/pprint-to-str (m/filter-keys
                              #(not (str/includes? % "password"))
                              jetty-config))))

(defonce ^:private instance*
  (atom nil))

(defn instance
  "*THE* instance of our Jetty web server, if there currently is one."
  ^Server []
  @instance*)

(defn- async-proxy-handler ^AbstractHandler [handler timeout]
  (proxy [AbstractHandler] []
    (handle [_ ^Request base-request ^HttpServletRequest request ^HttpServletResponse response]
      (let [^AsyncContext context (doto (.startAsync request)
                                    (.setTimeout timeout))
            request-map           (servlet/build-request-map request)
            raise                 (fn raise [^Throwable e]
                                    (log/error e (trs "Unexpected exception in endpoint"))
                                    (try
                                      (.sendError response 500 (.getMessage e))
                                      (catch Throwable e
                                        (log/error e (trs "Unexpected exception writing error response"))))
                                    (.complete context))]
        (try
          (handler
           request-map
           (fn [response-map]
             (server.protocols/respond (:body response-map) {:request       request
                                                             :request-map   request-map
                                                             :async-context context
                                                             :response      response
                                                             :response-map  response-map}))
           raise)
          (catch Throwable e
            (log/error e (trs "Unexpected Exception in API request handler"))
            (raise e))
          (finally
            (.setHandled base-request true)))))))

(defn create-server
  "Create a new async Jetty server with `handler` and `options`. Handy for creating the real Metabase web server, and
  creating one-off web servers for tests and REPL usage."
  ^Server [handler options]
  ;; if any API endpoint functions aren't at the very least returning a channel to fetch the results later after 10
  ;; minutes we're in serious trouble. (Almost everything 'slow' should be returning a channel before then, but
  ;; some things like CSV downloads don't currently return channels at this time)
  ;;
  ;; TODO - I suppose the default value should be moved to the `metabase.config` namespace?
  (let [timeout (or (config/config-int :mb-jetty-async-response-timeout)
                    (* 10 60 1000))
        handler (async-proxy-handler handler timeout)
        stats-handler (doto (StatisticsHandler.)
                        (.setHandler handler))]
    (doto ^Server (#'ring-jetty/create-server (assoc options :async? true))
      (.setHandler stats-handler))))

(defn start-web-server!
  "Start the embedded Jetty web server. Returns `:started` if a new server was started; `nil` if there was already a
  running server.

    (start-web-server! #'metabase.server.handler/app)"
  [handler]
  (when-not (instance)
    ;; NOTE: we always start jetty w/ join=false so we can start the server first then do init in the background
    (let [config     (jetty-config)
          new-server (create-server handler config)]
      (log-config config)
      ;; Only start the server if the newly created server becomes the official new server
      ;; Don't JOIN yet -- we're doing other init in the background; we can join later
      (when (compare-and-set! instance* nil new-server)
        (.start new-server)
        :started))))

(defn stop-web-server!
  "Stop the embedded Jetty web server. Returns `:stopped` if a server was stopped, `nil` if there was nothing to stop."
  []
  (let [[^Server old-server] (reset-vals! instance* nil)]
    (when old-server
      (log/info (trs "Shutting Down Embedded Jetty Webserver"))
      (.stop old-server)
      :stopped)))
