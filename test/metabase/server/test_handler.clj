(ns metabase.server.test-handler
  ;; this is actually a test namespace so we don't need to enforce model checks here.
  {:clj-kondo/config '{:linters {:metabase/modules {:level :off}}}}
  (:require
   [metabase.api-routes.core]
   [metabase.api.macros :as api.macros]
   [metabase.server.core :as server]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- make-test-handler :- ::api.macros/handler
  []
  (let [api-routes    #'metabase.api-routes.core/routes
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

(add-watch
 #'metabase.api-routes.core/routes
 ::reload
 (fn [_key _ref _old-state _new-stage]
   #_{:clj-kondo/ignore [:discouraged-var]}
   (println "metabase.api-routes.core/routes changed, reloading test handler...")
   (alter-var-root -test-handler (constantly (delay (make-test-handler))))))

(defn test-handler
  "Build the Ring handler used in tests and by `dev`."
  []
  @-test-handler)
