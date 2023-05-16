(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`.
   These are primarily used as the internal implementation of `defendpoint`."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [colorize.core :as colorize]
   [malli.core :as mc]
   [malli.error :as me]
   [malli.transform :as mtx]
   [metabase.async.streaming-response :as streaming-response]
   [metabase.config :as config]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.describe :as umd]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [potemkin.types :as p.types]
   [schema.core :as s])
  (:import
   (metabase.async.streaming_response StreamingResponse)))

(set! *warn-on-reflection* true)

(comment streaming-response/keep-me)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              DOCSTRING GENERATION                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- endpoint-name
  "Generate a string like `GET /api/meta/db/:id` for a defendpoint route."
  ([method route]
   (endpoint-name *ns* method route))

  ([endpoint-namespace method route]
   (format "%s %s%s"
           (name method)
           (-> (.getName (the-ns endpoint-namespace))
               (str/replace #"^metabase\.api\." "/api/")
               ;; HACK to make sure some enterprise endpoints are consistent with the code.
               ;; The right way to fix this is to move them -- see #22687
               ;; /api/ee/sandbox/table -> /api/table, this is an override route for /api/table if sandbox is available
               (str/replace #"^metabase-enterprise\.sandbox\.api\.table" "/api/table")
               ;; /api/ee/sandbox -> /api/mt
               (str/replace #"^metabase-enterprise\.sandbox\.api\." "/api/mt/")
               ;; /api/ee/content-management -> /api/moderation-review
               (str/replace #"^metabase-enterprise\.content-management\.api\." "/api/moderation-review/")
               ;; /api/ee/sso/sso/ -> /auth/sso
               (str/replace #"^metabase-enterprise\.sso\.api\." "/auth/")
               ;; this should be only the replace for enterprise once we resolved #22687
               (str/replace #"^metabase-enterprise\.([^\.]+)\.api\." "/api/ee/$1/"))
           (if (vector? route)
             (first route)
             route))))

(defn- args-form-flatten
  "A version of `flatten` that will actually flatten a form such as:

    [id :as {{:keys [dataset_query description display name visualization_settings]} :body}]"
  [form]
  (cond
    (map? form) (args-form-flatten (mapcat (fn [[k v]]
                                             [(args-form-flatten k) (args-form-flatten v)])
                                           form))
    (sequential? form) (mapcat args-form-flatten form)
    :else       [form]))

(defn- args-form-symbols
  "Return a map of arg -> nil for args taken from the arguments vector. This map is merged with the ones found in the
  schema validation map to build a complete map of args used by the endpoint."
  [form]
  (into {} (for [arg   (args-form-flatten form)
                 :when (and (symbol? arg)
                            (not= arg 'body))]
             {arg nil})))

(defn- dox-for-schema
  "Look up the docstring for `schema` for use in auto-generated API documentation. In most cases this is defined by
  wrapping the schema with `with-api-error-message`."
  [schema route-str]
  (if-not schema
    ""
    (or (su/api-error-message schema)
        ;; Don't try to i18n this stuff! It's developer-facing only.
        (when config/is-dev?
          (log/warn
           (u/format-color 'red (str "We don't have a nice error message for schema: %s defined at %s\n"
                                     "Consider wrapping it in `su/with-api-error-message`.")
                           (u/pprint-to-str schema) (u/add-period route-str)))))))

(defn- malli-dox-for-schema
  "Generate the docstring for `schema` for use in auto-generated API documentation."
  [schema route-str]
  (try (umd/describe schema)
       (catch Exception _
         (ex-data
          (when (and schema config/is-dev?) ;; schema is nil for any var without a schema. That's ok!
            (log/warn
             (u/format-color 'red (str "Invalid Malli Schema: %s defined at %s")
                             (u/pprint-to-str schema)
                             (u/add-period route-str)))))
         "")))

(defn- param-name
  "Return the appropriate name for this `param-symb` based on its `schema`. Usually this is just the name of the
  `param-symb`, but if the schema used a call to `su/api-param` we;ll use that name instead."
  [param-symb schema]
  (or (when (record? schema)
        (:api-param-name schema))
      (name param-symb)))

(defn- malli-format-route-schema-dox
  "Generate the `params` section of the documentation for a `defendpoint`-defined function by using the
  `param-symb->schema` map passed in after the argslist."
  [param-symb->schema route-str]
  ;; these are here
  (when (seq param-symb->schema)
    (str "\n\n### PARAMS:\n\n"
         (str/join "\n\n"
                   (for [[param-symb schema] param-symb->schema]
                     (format "*  **`%s`** %s"
                             (param-name param-symb schema)
                             (malli-dox-for-schema schema route-str)))))))

(defn- format-route-schema-dox
  "Generate the `params` section of the documentation for a `defendpoint`-defined function by using the
  `param-symb->schema` map passed in after the argslist."
  [param-symb->schema route-str]
  (when (seq param-symb->schema)
    (str "\n\n### PARAMS:\n\n"
         (str/join "\n\n" (for [[param-symb schema] param-symb->schema]
                            (format "*  **`%s`** %s" (param-name param-symb schema) (dox-for-schema schema route-str)))))))

(defn- format-route-dox
  "Return a markdown-formatted string to be used as documentation for a `defendpoint` function."
  [route-str docstr param->schema]
  (str (format "## `%s`" route-str)
       (when (seq docstr)
         (str "\n\n" (u/add-period docstr)))
       (format-route-schema-dox param->schema route-str)))

(defn- malli-format-route-dox
  "Return a markdown-formatted string to be used as documentation for a `defendpoint` function."
  [route-str docstr param->schema]
  (str (format "## `%s`" route-str)
       (when (seq docstr)
         (str "\n\n" (u/add-period docstr)))
       (malli-format-route-schema-dox param->schema route-str)))

(defn- contains-superuser-check?
  "Does the BODY of this `defendpoint` form contain a call to `check-superuser`?"
  [body]
  (let [body (set body)]
    (or (contains? body '(check-superuser))
        (contains? body '(api/check-superuser)))))

(defn malli-route-dox
  "Prints a markdown route doc for defendpoint"
  [method route docstr args param->schema body]
  (malli-format-route-dox (endpoint-name method route)
                          (str (u/add-period docstr) (when (contains-superuser-check? body)
                                                       "\n\nYou must be a superuser to do this."))
                          (merge (args-form-symbols args)
                                 param->schema)))

(defn route-dox
  "Generate a documentation string for a `defendpoint` route."
  [method route docstr args param->schema body]
  (format-route-dox (endpoint-name method route)
                    (str (u/add-period docstr) (when (contains-superuser-check? body)
                                                 "\n\nYou must be a superuser to do this."))
                    (merge (args-form-symbols args)
                           param->schema)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          AUTO-PARSING + ROUTE TYPING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn parse-int
  "Parse `value` (presumabily a string) as an Integer, or throw a 400 exception. Used to automatically to parse `id`
  parameters in `defendpoint` functions."
  [^String value]
  (try (Integer/parseInt value)
       (catch NumberFormatException _
         (throw (ex-info (tru "Not a valid integer: ''{0}''" value) {:status-code 400})))))

(def ^:dynamic *auto-parse-types*
  "Map of `param-type` -> map with the following keys:

     :route-param-regex Regex pattern that should be used for params in Compojure route forms
     :parser            Function that should be used to parse args"
  {:int  {:route-param-regex #"[0-9]+"
          :parser            'metabase.api.common.internal/parse-int}
   :uuid {:route-param-regex u/uuid-regex
          :parser            nil}})

(def ^:private ^:const  auto-parse-arg-name-patterns
  "Sequence of `[param-pattern parse-type]` pairs. A param with name matching PARAM-PATTERN should be considered to be
  of AUTO-PARSE-TYPE."
  [[#"^uuid$"       :uuid]
   [#"^session_id$" :uuid]
   [#"^[\w-_]*id$"  :int]])

(defn arg-type
  "Return a key into `*auto-parse-types*` if `arg` has a matching pattern in `auto-parse-arg-name-patterns`.

    (arg-type :id) -> :int"
  [arg]
  (some (fn [[pattern type]]
          (when (re-find pattern (name arg))
            type))
        auto-parse-arg-name-patterns))

;;; ## TYPIFY-ROUTE

(defn route-param-regex
  "If keyword `arg` has a matching type, return a pair like `[arg route-param-regex]`, where `route-param-regex` is the
  regex that this param that arg must match.

    (route-param-regex :id) -> [:id #\"[0-9]+\"]"
  [arg]
  (some->> (arg-type arg)
           *auto-parse-types*
           :route-param-regex
           (vector arg)))

(defn route-arg-keywords
  "Return a sequence of keywords for URL args in string `route`.

    (route-arg-keywords \"/:id/cards\") -> [:id]"
  [route]
  (->> (re-seq #":([\w-]+)" route)
       (map second)
       (map keyword)))

(defn- typify-args
  "Given a sequence of keyword `args`, return a sequence of `[:arg pattern :arg pattern ...]` for args that have
  matching types."
  [args]
  (->> args
       (mapcat route-param-regex)
       (filterv identity)))

(defn add-route-param-regexes
  "Expand a `route` string like \"/:id\" into a Compojure route form that uses regexes to match parameters whose name
  matches a regex from `auto-parse-arg-name-patterns`.

    (add-route-param-regexes \"/:id/card\") -> [\"/:id/card\" :id #\"[0-9]+\"]"
  [route]
  (if (vector? route)
    route
    (let [arg-types (typify-args (route-arg-keywords route))]
      (if (empty? arg-types)
        route
        (apply vector route arg-types)))))

(defn- ->matching-regex
  "Note: this is called in a macro context, so it can potentially be passed a symbol that evaluates to a schema."
  [schema]
  (let [schema-type (try (mc/type schema)
                         (catch clojure.lang.ExceptionInfo _
                           (mc/type #_:clj-kondo/ignore (eval schema))))]
    [schema-type
     (condp = schema-type
       ;; can use any regex directly
       :re (first (try (mc/children schema)
                       (catch clojure.lang.ExceptionInfo _
                         (mc/children #_:clj-kondo/ignore (eval schema)))))
       'pos-int? #"[0-9]+"
       :int #"-?[0-9]+"
       'int? #"-?[0-9]+"
       :uuid u/uuid-regex
       'uuid? u/uuid-regex
       nil)]))

(def ^:private no-regex-schemas #{(mc/type ms/NonBlankString)
                                  (mc/type (mc/schema [:maybe ms/PositiveInt]))
                                  (mc/type [:enum "a" "b"])})

(defn add-route-param-schema
  "Expand a `route` string like \"/:id\" into a Compojure route form with regexes to match parameters based on
  malli schemas given in the `arg->schema` map.

  (add-route-param-schema '{id :int} \"/:id/card\") -> [\"/:id/card\" :id #\"[0-9]+\"]
  (add-route-param-schema {} \"/:id/card\") -> \"/:id/card\""
  [arg->schema route]
  (if (vector? route)
    route
    (let [[wildcard & wildcards]
          (->> "metabase.api.common.internal/no-regex-schemas."
               (str "Either add " (pr-str schema-type) " to "
                    "metabase.api.common.internal/->matching-regex or ")
               colorize/green
               log/warn
               (when (and config/is-dev? (not (contains? no-regex-schemas schema-type)))
                 (log/warn (colorize/red (str "Warning: missing route-param regex for schema: "
                                              route " " [k schema]))))
               (if re
                 [route (keyword k) re])
               (for [[k schema] arg->schema
                     :when (re-find (re-pattern (str ":" k)) route)
                     :let [[schema-type re] (->matching-regex schema)]])
               (remove nil?))]
      (cond
        ;; multiple hits -> tack them onto the original route shape.
        wildcards (vec (reduce into wildcard (mapv #(drop 1 %) wildcards)))
        wildcard wildcard
        :else route))))

;;; ## ROUTE ARG AUTO PARSING

(defn let-form-for-arg
  "Given an `arg-symbol` like `id`, return a pair like `[id (Integer/parseInt id)]` that can be used in a `let` form."
  [arg-symbol]
  (when (symbol? arg-symbol)
    (some-> (arg-type arg-symbol)                                     ; :int
            *auto-parse-types*                                        ; {:parser ... }
            :parser                                                   ; Integer/parseInt
            ((fn [parser] `(when ~arg-symbol (~parser ~arg-symbol)))) ; (when id (Integer/parseInt id))
            ((partial vector arg-symbol)))))                          ; [id (Integer/parseInt id)]

(defmacro auto-parse
  "Create a `let` form that applies corresponding parse-fn for any symbols in `args` that are present in
  `*auto-parse-types*`."
  {:style/indent 1}
  [args & body]
  (let [let-forms (->> args
                       (mapcat let-form-for-arg)
                       (filter identity))]
    `(let [~@let-forms]
       ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          AUTO-COERCION                                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

(def defendpoint-transformer
  "Transformer used on values coming over the API via defendpoint."
  (mtx/transformer
   (mtx/string-transformer)
   (mtx/json-transformer)
   (mtx/transformer {:name "metabase-api"})))

(defn- extract-symbols [in]
  (let [*symbols (atom [])]
    (walk/postwalk
     (fn [x] (when (symbol? x) (swap! *symbols conj x)) x)
     in)
    @*symbols))

(defn- mauto-let-form [arg->schema arg-symbol]
  (when arg->schema
    (when-let [schema (arg->schema arg-symbol)]
      `[~arg-symbol (mc/decode ~schema ~arg-symbol defendpoint-transformer)])))

(defmacro auto-coerce
  "Create a `let` form that tries to coerce the value bound to any symbol in `args` that are present in
  `arg->schema` using [[defendpoint-transformer]]."
  {:style/indent 1}
  [args arg->schema & body]
  (let [let-forms (->> args
                       extract-symbols
                       (mapcat #(mauto-let-form arg->schema %))
                       (remove nil?))]
    `(let [~@let-forms] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                PARAM VALIDATION                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn malli-validate-param
  "Validate a parameter against its respective malli schema, or throw an Exception."
  [field-name value schema]
  (when-not (mc/validate schema value)
    (throw (ex-info (tru "Invalid m field: {0}" field-name)
                    {:status-code 400
                     :errors      {(keyword field-name) (umd/describe schema)}
                     :specific-errors {(keyword field-name)
                                       (-> schema
                                           (mc/explain value)
                                           me/with-spell-checking
                                           (me/humanize {:wrap mu/humanize-include-value}))}}))))

(defn validate-param
  "Validate a parameter against its respective schema, or throw an Exception."
  [field-name value schema]
  (try (s/validate schema value)
       (catch Throwable e
         (throw (ex-info (tru "Invalid field: {0}" field-name)
                         {:status-code 400
                          :errors      {(keyword field-name) (or (su/api-error-message schema)
                                                                 (:message (ex-data e))
                                                                 (.getMessage e))}})))))

(defn malli-validate-params
  "Generate a series of `malli-validate-param` calls for each param and malli schema pair in PARAM->SCHEMA."
  [param->schema]
  (for [[param schema] param->schema]
    `(malli-validate-param '~param ~param ~schema)))

(defn validate-params
  "Generate a series of `validate-param` calls for each param and schema pair in PARAM->SCHEMA."
  [param->schema]
  (for [[param schema] param->schema]
    `(validate-param '~param ~param ~schema)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      MISC. OTHER FNS USED BY DEFENDPOINT                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn. Name is just `method` + `route` with slashes
  replaced by underscores.

    (route-fn-name GET \"/:id\") ;-> GET_:id"
  [method route]
  ;; if we were passed a vector like [":id" :id #"[0-9+]"] only use first part
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (^String .replace "/" "_")
        symbol)))

(p.types/defprotocol+ EndpointResponse
  "Protocol for transformations that should be done to the value returned by a `defendpoint` form before it
  Compojure/Ring see it."
  (wrap-response-if-needed [this]
    "Transform the value returned by a `defendpoint` form as needed, e.g. by adding `:status` and `:body`."))

(extend-protocol EndpointResponse
  Object
  (wrap-response-if-needed [this]
    {:status 200, :body this})

  nil
  (wrap-response-if-needed [_]
    {:status 204, :body nil})

  StreamingResponse
  (wrap-response-if-needed [this]
    this)

  clojure.lang.IPersistentMap
  (wrap-response-if-needed [m]
    (if (and (:status m) (contains? m :body))
      m
      {:status 200, :body m})))
