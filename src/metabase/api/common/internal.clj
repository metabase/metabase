(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`."
  (:require [metabase.util :refer [fn-> regex?]])
  (:import com.metabase.corvus.api.ApiException))

;;; # DEFENDPOINT HELPER FUNCTIONS + MACROS

;;; ## ROUTE NAME

(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn.
   Name is just METHOD + ROUTE with slashes replaced by underscores.
   `(route-fn-name GET \"/:id\") -> GET_:id`"
  [method route]
  (let [route (if (vector? route) (first route) route)] ; if we were passed a vector like [":id" :id #"[0-9+]"] only use first part
    (-> (str (name method) route)
        (^String .replace "/" "_")
        symbol)))


;;; ## ROUTE TYPING / AUTO-PARSE SHARED FNS

(def ^:dynamic *auto-parse-types*
  "Map of `param-type` -> map with the following keys:

     :route-param-regex Regex pattern that should be used for params in Compojure route forms
     :parser            Function that should be used to parse args"
  {:int {:route-param-regex #"[0-9]+"
         :parser 'Integer/parseInt}})

(def ^:dynamic *auto-parse-arg-name-patterns*
  "Sequence of `[param-pattern parse-type]` pairs.
   A param with name matching PARAM-PATTERN should be considered to be of AUTO-PARSE-TYPE."
  [[#"[\w-_]*id" :int]
   [#"org" :int]])

(defn arg-type
  "Return a key into `*auto-parse-types*` if ARG has a matching pattern in `*auto-parse-arg-name-patterns*`.

    (arg-type :id) -> :int"
  [arg]
  (-> *auto-parse-arg-name-patterns*
      ((fn [[[pattern type] & rest-patterns]]
         (or (when (re-find pattern (name arg))
               type)
             (when rest-patterns
               (recur rest-patterns)))))))


;;; ## TYPIFY-ROUTE

(defn route-param-regex
  "If keyword ARG has a matching type, return a pair like `[arg route-param-regex]`,
   where ROUTE-PARAM-REGEX is the regex that this param that arg must match.

    (route-param-regex :id) -> [:id #\"[0-9]+\"]"
  [arg]
  (some->> (arg-type arg)
           *auto-parse-types*
           :route-param-regex
           (vector arg)))

(defn route-arg-keywords
  "Return a sequence of keywords for URL args in string ROUTE.

    (route-arg-keywords \"/:id/cards\") -> [:id]"
  [route]
  (->> (re-seq #":([\w-]+)" route)
       (map (fn-> second keyword))))

(defn typify-args
  "Given a sequence of keyword ARGS, return a sequence of `[:arg pattern :arg pattern ...]`
   for args that have matching types."
  [args]
  (->> args
       (mapcat route-param-regex)
       (filterv identity)))

(defn typify-route
  "Expand a ROUTE string like \"/:id\" into a Compojure route form that uses regexes to match
   parameters whose name matches a regex from `*auto-parse-arg-name-patterns*`.

    (typify-route \"/:id/card\") -> [\"/:id/card\" :id #\"[0-9]+\"]"
  [route]
  (if (vector? route) route
      (let [arg-types (->> (route-arg-keywords route)
                           typify-args)]
        (if (empty? arg-types) route
            (apply vector route arg-types)))))


;;; ## ROUTE ARG AUTO PARSING

(defn let-form-for-arg
  "Given an ARG-SYMBOL like `id`, return a pair like `[id (Integer/parseInt id)]`
  that can be used in a `let` form."
  [arg-symbol]
  (when (symbol? arg-symbol)
    (some-> (arg-type arg-symbol)                                    ; :int
            *auto-parse-types*                                       ; {:parser ... }
            :parser                                                  ; Integer/parseInt
            ((fn [parser] `(when ~arg-symbol (~parser ~arg-symbol)))) ; (when id (Integer/parseInt id))
            ((partial vector arg-symbol)))))                         ; [id (Integer/parseInt id)]

(defmacro auto-parse
  "Create a `let` form that applies corresponding parse-fn for any symbols in ARGS that are present in `*auto-parse-types*`."
  [args & body]
  (let [let-forms (->> args
                       (mapcat let-form-for-arg)
                       (filter identity))]
    `(let [~@let-forms]
       ~@body)))


;;; ## ROUTE BODY WRAPPERS

(defmacro catch-api-exceptions
  "Execute BODY, and if an exception is thrown, return the appropriate HTTP response."
  [& body]
  `(try ~@body
        (catch ApiException e#
          {:status (.getStatusCode e#)
           :body (.getMessage e#)})
        (catch Throwable e#
          (let [message# (.getMessage e#)
                stacktrace# (->> (map str (.getStackTrace e#))
                                 (filter (partial re-find #"metabase")))]
            (println message#)
            (clojure.pprint/pprint stacktrace#)
            {:status 500
             :body {:message message#
                    :stacktrace stacktrace#}}))))

(defn wrap-response-if-needed
  "If RESPONSE isn't already a map with keys `:status` and `:body`, wrap it in one (using status 200)."
  [response]
  (when (medley.core/boolean? response)                                                            ; Not sure why this is but the JSON serialization middleware
    (throw (Exception. "Attempted to return a boolean as an API response. This is not allowed!"))) ; barfs if response is just a plain boolean
  (letfn [(is-wrapped? [resp] (and (map? resp)
                                   (contains? resp :status)
                                   (contains? resp :body)))]
    (if (is-wrapped? response) response
        {:status 200
         :body response})))
