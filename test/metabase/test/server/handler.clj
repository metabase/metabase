(ns metabase.test.server.handler
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.mcp.http-handler :as mcp.http-handler]
   [metabase.oauth-server.api :as oauth-server.api]
   [metabase.server.core :as server]
   [metabase.sso.auth-wrapper :as auth-wrapper]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- make-test-handler :- ::api.macros/handler
  []
  ;; Resolved here because a static require would make loading `metabase.test` load every API namespace.
  (let [api-routes    (requiring-resolve 'metabase.api-routes.core/routes)
        server-routes (server/make-routes {:api        api-routes
                                           :auth       #'auth-wrapper/routes
                                           :oauth      #'oauth-server.api/oauth-routes
                                           :well-known #'oauth-server.api/well-known-routes})
        handler       (server/make-handler server-routes #'mcp.http-handler/options)]
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
