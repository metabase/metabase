(ns dev.spy-handler-middleware)

(def ^:private my-spy-atom (atom []))

(defn- spy-mw
  [context handler]
  (fn
    [request respond raise]
    (swap! my-spy-atom conj [context request])
    (handler request respond raise)))

(defn apply-spy-middleware
  "Given a middleware stack, return a new middleware stack that has a spy middleware at the start, end,
  and interleaved between each middleware.

  Call this on a middleware stack, e.g. [[metabase.server.handler/middleware]]. A new middleware stack
  will be returned. Use that middleware stack to start your server, and each request step
  will be recorded in [[my-spy-atom]]"
  [original-middlewares]
  (concat (interleave
           (map (fn [mw]
                  (partial spy-mw (str "after-" (:name (meta mw)))))
                original-middlewares)
           original-middlewares)
          [(partial spy-mw "initial-request")]))

(comment
  (require 'dev.spy-handler-middleware)
  (mu/defn- apply-middleware :- ::api.macros/handler
    [handler :- ::api.macros/handler]
    (reduce
     (fn [handler middleware-fn]
       (middleware-fn handler))
     handler
     (dev.spy-handler-middleware/apply-spy-middleware middleware))))
