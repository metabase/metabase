(ns metabase.api.common
  (:require [clojure.string :as str]))

(defn optional
  "Helper function for defining functions that accept optional arguments. If `pred?` is true of the first item in `args`,
  a pair like `[first-arg other-args]` is returned; otherwise, a pair like `[default other-args]` is returned.

  If `default` is not specified, `nil` will be returned when `pred?` is false.

    (defn
      ^{:arglists ([key? numbers])}
      wrap-nums [& args]
      (let [[k nums] (optional keyword? args :nums)]
        {k nums}))
    (wrap-nums 1 2 3)          -> {:nums [1 2 3]}
    (wrap-nums :numbers 1 2 3) -> {:numbers [1 2 3]}"
  {:arglists '([pred? args]
               [pred? args default])}
  [pred? args & [default]]
  (if (pred? (first args)) [(first args) (next args)]
      [default args]))

(defn add-route-param-regexes
  "Expand a `route` string like \"/:id\" into a Compojure route form that uses regexes to match parameters whose name
  matches a regex from `auto-parse-arg-name-patterns`.

    (add-route-param-regexes \"/:id/card\") -> [\"/:id/card\" :id #\"[0-9]+\"]"
  [route]
  (if (vector? route)
    route
    (let [arg-types nil #_(typify-args (route-arg-keywords route))]
      (if (empty? arg-types)
        route
        (apply vector route arg-types)))))

(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn. Name is just `method` + `route` with slashes
  replaced by underscores.

    (route-fn-name GET \"/:id\") ;-> GET_:id"
  [method route]
  ;; if we were passed a vector like [":id" :id #"[0-9+]"] only use first part
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defmacro defendpoint*
  "Impl macro for `defendpoint`; don't use this directly."
  [{:keys [method route fn-name docstr args body]}]
  `(def ~(vary-meta fn-name
                    assoc

                    :doc          docstr
                    :is-endpoint? true)
     (~(symbol "compojure.core" (name method)) ~route ~args
      ~@body)))

(defn- parse-defendpoint-args [[method route & more]]
  (let [fn-name                (route-fn-name method route)
        route                  (add-route-param-regexes route)
        [docstr [args & more]] (optional string? more)
        [arg->schema body]     (optional (every-pred map? #(every? symbol? (keys %))) more)]
    (when-not docstr
      ;; Don't i18n this, it's dev-facing only
      :TODO/emit-clj-kondo-warning-for-missing-docstring
      #_(log/warn (u/format-color 'red "Warning: endpoint %s/%s does not have a docstring. Go add one."
                                (ns-name *ns*) fn-name)))
    {:method      method
     :route       route
     :fn-name     fn-name
     ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document
     ;; their API error messages
     :docstr "foo"
     :args        args
     :arg->schema arg->schema
     :body        body}))

(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via
      `Integer/parseInt`

   -  converts `route` from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`

   -  sequentially applies specified annotation functions on args to validate them.

   -  automatically calls `wrap-response-if-needed` on the result of `body`

   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below) will automatically include
      the function in the generated `defroutes` form.

   -  Generates a super-sophisticated Markdown-formatted docstring"
  ;; {:arglists '([method route docstr? args schemas-map? & body])}
  [& defendpoint-args]
  (let [{:keys [args body arg->schema], :as defendpoint-args} (parse-defendpoint-args defendpoint-args)]
    `(defendpoint* ~(assoc defendpoint-args
                           :body `(do ~args
                                      ~arg->schema
                                      (do ~@body))))))
