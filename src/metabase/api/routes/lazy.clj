(ns metabase.api.routes.lazy
  "Utils for creating lazy-loading Compojure routes, for fast Metabase startup times."
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
     (ns-resolve ns-symb 'routes))))

(defmacro context
  "Basically the same as normal Compojure `context`, but avoids reevaluating the `handler` form on every request, which
  is important for lazy-loading stuff. One difference: doesn't take an args vector, which we don't make a lot of use
  of in Metabase.

    (lazy/context \"/mt\" my-handler)"
  [route handler]
  `(let [handler# ~handler]
     (compojure/context ~route [] handler#)))

(defmacro form-context
  "Impl for `routes` macro; don't use directly."
  [root-namespace form]
  (letfn [(unwrap [form]
            (if (symbol? form)
              [(str "/" form) `(ns-handler '~(symbol (str root-namespace \. form)))]
              (let [[middleware nested-form] form
                    [route handler]           (unwrap nested-form)]
                [route (list middleware handler)])))]
    (let [[route handler] (unwrap form)]
      `(context ~route ~handler))))

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
  `(compojure/routes ~@(for [form forms]
                         `(form-context ~root-namespace ~form))))
