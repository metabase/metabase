(ns metabase.server.test-handler
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.server.core :as server]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- make-test-handler :- ::api.macros/handler
  []
  (let [api-routes    #_{:clj-kondo/ignore [:metabase/modules]} (requiring-resolve 'metabase.api-routes.core/routes)
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
