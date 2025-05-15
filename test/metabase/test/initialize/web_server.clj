(ns metabase.test.initialize.web-server
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.config :as config]
   [metabase.core.initialization-status :as init-status]
   [metabase.server.core :as server]
   [metabase.settings.core :as setting]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- make-test-handler :- ::api.macros/handler
  []
  (let [api-routes    (requiring-resolve 'metabase.api-routes.core/routes)
        server-routes (server/make-routes api-routes)
        handler       (server/make-handler server-routes)]
    (fn [request respond raise]
      (letfn [(raise' [e]
                (log/errorf "ERROR HANDLING REQUEST! <async raise> %s" request)
                (log/error e)
                (raise e))]
        (try
          (handler request respond raise')
          (catch Throwable e
            (log/errorf "ERROR HANDLING REQUEST! <async thrown> %s" request)
            (log/error e)
            (throw e)))))))

(def ^:private -test-handler
  (delay (make-test-handler)))

(defn test-handler
  "Build the Ring handler used in tests and by `dev`."
  []
  @-test-handler)

(defn init! []
  (try
    (server/start-web-server! (test-handler))
    (log/infof "Started test server on port %d" (config/config-int :mb-jetty-port))
    (catch Throwable e
      (log/fatal e "Web server failed to start")
      (when config/is-test?
        (System/exit -2))))
  (init-status/set-complete!)
  (setting/set! :site-name "Metabase Test"))
