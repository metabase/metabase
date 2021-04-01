(ns metabase.api.routes.lazy
  "Utils for creating lazy-loading Compojure routes, for fast Metabase startup times.

  Some of the code here relies on a little bit of knowledge about Compojure/Clout internals -- look at the way normal
  Compojure `routes` and `context` work if the things we're doing here aren't clear."
  (:require [clojure.tools.logging :as log]
            [compojure.core :as compojure]
            [metabase.plugins.classloader :as classloader]))

(defn handler
  "Create a lazy-loading Ring request handler. `thunk` is called on the first request, and should return a handler; this
  value is cached and used for all subsequent requests."
  [thunk]
  (let [dlay (delay (thunk))]
    (fn [request respond raise]
      (@dlay request respond raise))))

(defn ns-handler
  "A lazy-loading Ring request handler that requires (in a thread-safe way) the namespace named by `ns-symb` and looks
  for the var named `routes`.

    (ns-handler 'metabase.api.util) -> <lazy-handler>

    (<lazy-handler> request respond raise) -> (metabase.api.util/routes request respond raise)"
  [ns-symb]
  (handler
   (fn []
     (log/debugf "Lazy-loading API routes in %s" ns-symb)
     ;; classloader/require is thread-safe
     (classloader/require ns-symb)
     (var-get (ns-resolve ns-symb 'routes)))))

(defn context
  "Basically the same as normal Compojure `context`, but avoids reevaluating the `handler` form on every request, which
  is important for lazy-loading stuff. One difference: doesn't take an args vector, which we don't make a lot of use
  of in Metabase.

    (lazy/context \"/mt\" my-handler)"
  [route handler]
  (compojure/make-context
   (#'compojure/context-route route)
   (constantly handler)))

(defn- route+handler
  "Convert a form passed to `routes*` to a pair of `[route handler]`.

    (route+handler 'metabase.api '(+auth card)) ;-> [\"/card/\" (+auth (ns-handler 'metabase.api.card))]"
  [root-namespace form]
  (letfn [(unwrap [form]
            (if (symbol? form)
              [(str "/" form) (ns-handler (symbol (str root-namespace \. form)))]
              (let [[middleware nested-form] form
                    [route handler]           (unwrap nested-form)]
                [route (list middleware handler)])))]
    (unwrap form)))

(defn- path-info
  "Get the current path for the request. This is the same thing Compojure/Clout do under the hood. `:path-info` is the
  part of the request path we haven't handled yet; e.g. for `GET /api/card` the handler in `metabase.api.routes` would
  see a `:path-info` of `/card`."
  [request]
  (or (:path-info request)
      (:uri request)))

(defn- split-context
  "Split a request URI like `/card/1` into two parts, the 'context' (`/card`) and everything else (`/1`). The context is
  used for routing to send this request to the appropriate handler. The other stuff is passed along to the next
  handler so it can do whatever is appropriate with it.

  Splitting a string with `loop` is significantly faster than using a regex -- I profiled a bunch of different things
  and this is the fastest method I came up with."
  [^String s]
  (let [len (count s)]
    (loop [i 1]
      (when (< i len)
        (if (= (.charAt s i) \/)
          [(.substring s 0 i)
           (.substring s i (count s))]
          (recur (inc i)))))))

(defn routes*
  "Impl for `routes` macro; don't call directly."
  [root-namespace forms]
  ;; build a map of route context -> handler e.g.
  ;; {"/card" <card-handler>
  ;;  "/dashboard" <dashboard-handler>}
  (let [handler-map (into {} (for [form forms]
                               (route+handler root-namespace form)))]
    (fn [request respond raise]
      ;; look for a matching handler based on the context.
      (let [[context more] (split-context (path-info request))]
        (if-let [handler (get handler-map context)]
          ;; If we find one, update `:path-info` with everything after `context` and forward the request to it -- this
          ;; is the same thing Compojure does under the hood
          (handler (assoc request :path-info more) respond raise)
          ;; otherwise return `nil`; Compojure will try the next handler
          (respond nil))))))

(defmacro routes
  "Similar to normal Compojure `routes` in combination with `context`, but lazy loads routes upon first matching
  request. Syntax is more concise:

    ;; compojure.core/routes
    (routes
     (context \"/card\" [] (+auth metabase.api.card/routes))
     (context \"/util\" [] metabase.api.util/routes))

    ;; equivalent metabase.api.routes.lazy/routes
    (lazy/routes metabase.api
      (+auth card)
      util)

  The namespace to load is determined prepending `root-namespace` to the symbol in a given form. The `context` is the
  same as the symbol. This means your namespaces have to match the API corresponding routes! (I think this is a good
  constraint.)

  Macroexpand usages of this if it's not clear what it's doing -- I implemented this as a macro so it's easier to
  understand what it does. <3 Cam"
  {:style/indent 1}
  [root-namespace & forms]
  `(routes* '~root-namespace '~forms))
