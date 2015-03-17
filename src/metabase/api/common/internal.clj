(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`."
  (:require [clojure.tools.logging :as log]
            [metabase.util :refer [fn-> regex?]])
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
         :parser 'Integer/parseInt}
   :uuid {:route-param-regex #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
          :parser nil}})

(def ^:dynamic *auto-parse-arg-name-patterns*
  "Sequence of `[param-pattern parse-type]` pairs.
   A param with name matching PARAM-PATTERN should be considered to be of AUTO-PARSE-TYPE."
  [[#"^uuid$" :uuid]
   [#"^[\w-_]*id$" :int]
   [#"^org$" :int]])

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
            (log/debug message# "\n" (with-out-str (clojure.pprint/pprint stacktrace#)))
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


;;; ## ARG ANNOTATION FUNCTIONALITY

;;; ### Args Form Deannotation

(defn deannotate-arg
  "If FORM is a symbol, strip off any annotations.

    (deannotate-arg 'password.required) -> password"
  [form]
  (if-not (symbol? form) form
          (let [[arg & _] (clojure.string/split (name form) #"\.")]
            (symbol arg))))

(defn deannotate-args-form
  "Walk ARGS-FORM and strip off any annotations.

    (deannotate-args-form [id :as {{:keys [password.required old_password.required]} :body}])
      -> [id :as {{:keys [password old_password]} :body}]"
  [args-form]
  (if (= args-form []) '[:as _]
      (->> args-form
           (mapv (partial clojure.walk/prewalk deannotate-arg)))))


;;; ### Args Form Annotation Gathering

(defn args-form->symbols
  "Recursively walk ARGS-FORM and return a sequence of symbols.

    (args-form->symbols [id :as {{:keys [password.required old_password.required]} :body}])
      -> (id password.required old_password.required)"
  [args-form]
  {:post [(sequential? %)
          (every? symbol? %)]}
  (cond
    (symbol? args-form) [args-form]
    (map? args-form) (->> args-form
                          (mapcat (fn [[k v]]
                                    [(args-form->symbols k) (args-form->symbols v)]))
                          (mapcat args-form->symbols))
    (sequential? args-form) (mapcat args-form->symbols
                                    args-form)
    :else []))

(defn symb->arg+annotations
  "Return a sequence of pairs of `[annotation-kw deannotated-arg-symb]` for an annotated ARG.

    (symb->arg+annotations 'password)              -> nil
    (symb->arg+annotations 'password.required)     -> [[:required password]]
    (symb->arg+annotations 'password.required.str) -> [[:required password], [:str password]]"
  [arg]
  {:pre [(symbol? arg)]}
  (let [[arg & annotations] (clojure.string/split (name arg) #"\.")]
    (when (seq annotations)
      (->> annotations
           (map (fn [annotation]
                  [(keyword annotation) (symbol arg)]))))))

(defn args-form->arg+annotations-pairs
  [annotated-args-form]
  {:pre [(vector? annotated-args-form)]}
  (->> annotated-args-form
       args-form->symbols
       (mapcat symb->arg+annotations)))


;;; ### let-annotated-args

(defn arg-annotation-let-binding
  "Return a pair like `[arg-symb arg-annotation-form]`, where `arg-annotation-form` is the result of calling the `arg-annotation-fn` implementation
   for ANNOTATION-KW."
  [[annotation-kw arg-symb]] ; dispatch-fn passed as a param to avoid circular dependencies
  {:pre [(keyword? annotation-kw)
         (symbol? arg-symb)]}
  `[~arg-symb ~((eval 'metabase.api.common/arg-annotation-fn) annotation-kw arg-symb)])

(defmacro let-annotated-args
  "Wrap BODY in a let-form that calls corresponding implementations of `arg-annotation-fn` for annotated args in ANNOTATED-ARGS-FORM."
  [annotated-args-form & body]
  {:pre [(vector? annotated-args-form)]}
  (let [annotations (->> annotated-args-form
                         args-form->symbols
                         (mapcat symb->arg+annotations)
                         (mapcat arg-annotation-let-binding))]
    (if (seq annotations)
      `(let [~@annotations]
         ~@body)
      `(do ~@body))))
