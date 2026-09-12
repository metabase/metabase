(ns metabase.server.test-handler
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.server.core :as server]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn app-api-routes
  "The application's own API route tree, the handler mounted under `/api`."
  []
  ;; late-bound: a static require here would drag the whole API route tree into the server module
  #_{:clj-kondo/ignore [:metabase/modules]} (requiring-resolve 'metabase.api-routes.core/routes))

(mu/defn make-test-handler :- ::api.macros/handler
  "Build the full Ring handler (server routes plus middleware) that serves `api-routes` under `/api`. Defaults to
  [[app-api-routes]]."
  ([]
   (make-test-handler (app-api-routes)))

  ([api-routes :- ::api.macros/handler]
   (let [server-routes (server/make-routes api-routes)
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
             (throw e))))))))

(def ^:private -test-handler
  (delay (make-test-handler)))

(def ^:dynamic *test-handler*
  "When bound, [[test-handler]] returns this handler instead of the default one built from [[app-api-routes]]. Bind
  it via [[do-with-api-routes]] to test API routes that the application does not mount."
  nil)

(defn test-handler
  "Build the Ring handler used in tests and by `dev`."
  []
  (or *test-handler* @-test-handler))

(defn do-with-api-routes
  "Run `thunk` with the test HTTP client serving `api-routes` under `/api` instead of the application's own route
  tree. `api-routes` is a Ring handler such as one built with [[metabase.api.util.handlers/routes]]; compose it with
  [[app-api-routes]] to fall through to the application's routes."
  [api-routes thunk]
  (binding [*test-handler* (make-test-handler api-routes)]
    (thunk)))
