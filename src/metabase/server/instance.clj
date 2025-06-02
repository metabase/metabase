(ns metabase.server.instance
  "Code related to configuring, starting, and stopping the Metabase Jetty web server."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.config.core :as config]
   [metabase.server.protocols :as server.protocols]
   [metabase.server.statistics-handler :as statistics-handler]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [ring.adapter.jetty :as ring-jetty]
   [ring.util.jakarta.servlet :as servlet])
  (:import
   (jakarta.servlet AsyncContext)
   (jakarta.servlet.http HttpServletRequest HttpServletResponse)
   (org.eclipse.jetty.ee9.nested Request)
   (org.eclipse.jetty.ee9.servlet ServletContextHandler ServletHandler)
   (org.eclipse.jetty.server Server)))

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
    :sni-host-check? (when (config/config-bool :mb-jetty-skip-sni)
                       false)}))

(mu/defn- jetty-config :- :map
  []
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

(defn- async-proxy-handler ^ServletHandler [handler timeout]
  (proxy [ServletHandler] []
    (doHandle [_ ^Request base-request ^HttpServletRequest request ^HttpServletResponse response]
      (let [^AsyncContext context (doto (.startAsync request)
                                    (.setTimeout timeout))
            request-map           (servlet/build-request-map request)
            raise                 (fn raise [^Throwable e]
                                    (log/error e "Unexpected exception in endpoint")
                                    (try
                                      (.sendError response 500 (.getMessage e))
                                      (catch Throwable e
                                        (log/error e "Unexpected exception writing error response")))
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
            (log/error e "Unexpected Exception in API request handler")
            (raise e))
          (finally
            (.setHandled base-request true)))))))

(mu/defn create-server
  "Create a new async Jetty server with `handler` and `options`. Handy for creating the real Metabase web server, and
  creating one-off web servers for tests and REPL usage."
  ^Server [handler :- ::api.macros/handler
           options :- [:maybe :map]]
  ;; if any API endpoint functions aren't at the very least returning a channel to fetch the results later after 10
  ;; minutes we're in serious trouble. (Almost everything 'slow' should be returning a channel before then, but
  ;; some things like CSV downloads don't currently return channels at this time)
  (let [timeout         (config/config-int :mb-jetty-async-response-timeout)
        handler         (async-proxy-handler handler timeout)
        servlet-handler (doto (ServletContextHandler.)
                          (.setAllowNullPathInfo true)
                          (.insertHandler (statistics-handler/new-handler))
                          (.setServletHandler handler))]
    (doto ^Server (#'ring-jetty/create-server (assoc options :async? true))
      (.setHandler servlet-handler))))

(mu/defn start-web-server!
  "Start the embedded Jetty web server. Returns `:started` if a new server was started; `nil` if there was already a
  running server.

    (let [server-routes (metabase.server.core/make-routes #'metabase.api-routes.core/routes)
          handler       (metabase.server.core/make-handler server-routes)]
        (metabase.server.core/start-web-server! handler))"
  [handler :- ::api.macros/handler]
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
      (log/info "Shutting Down Embedded Jetty Webserver")
      (.stop old-server)
      :stopped)))
