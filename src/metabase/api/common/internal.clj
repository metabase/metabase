(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`.
   These are primarily used as the internal implementation of `defendpoint`."
  (:require [cheshire
             [core :as json]
             [generate :as json-gen]]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [ring.util
             [io :as rui]
             [response :as rr]]
            [schema.core :as s])
  (:import com.fasterxml.jackson.core.JsonGenerator
           [java.io BufferedWriter OutputStream OutputStreamWriter]
           [java.nio.charset Charset StandardCharsets]
           java.sql.SQLException))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              DOCSTRING GENERATION                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- endpoint-name
  "Generate a string like `GET /api/meta/db/:id` for a defendpoint route."
  [method route]
  (format "%s %s%s"
          (name method)
          (str/replace (.getName *ns*) #"^metabase\.api\." "/api/")
          (if (vector? route)
            (first route)
            route)))

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
  "Look up the docstring for SCHEMA for use in auto-generated API documentation. In most cases this is defined by
  wrapping the schema with `with-api-error-message`."
  [schema]
  (if-not schema
    ""
    (or (su/api-error-message schema)
        (log/warn "We don't have a nice error message for schema:"
                  schema
                  "Consider wrapping it in `su/with-api-error-message`."))))

(defn- param-name
  "Return the appropriate name for this PARAM-SYMB based on its SCHEMA. Usually this is just the name of the
  PARAM-SYMB, but if the schema used a call to `su/api-param` we;ll use that name instead."
  [param-symb schema]
  (or (when (record? schema)
        (:api-param-name schema))
      (name param-symb)))

(defn- format-route-schema-dox
  "Generate the `PARAMS` section of the documentation for a `defendpoint`-defined function by using the
   PARAM-SYMB->SCHEMA map passed in after the argslist."
  [param-symb->schema]
  (when (seq param-symb->schema)
    (str "\n\n##### PARAMS:\n\n"
         (str/join "\n\n" (for [[param-symb schema] param-symb->schema]
                            (format "*  **`%s`** %s" (param-name param-symb schema) (dox-for-schema schema)))))))

(defn- format-route-dox
  "Return a markdown-formatted string to be used as documentation for a `defendpoint` function."
  [route-str docstr param->schema]
  (str (format "## `%s`" route-str)
       (when (seq docstr)
         (str "\n\n" docstr))
       (format-route-schema-dox param->schema)))

(defn- contains-superuser-check?
  "Does the BODY of this `defendpoint` form contain a call to `check-superuser`?"
  [body]
  (let [body (set body)]
    (or (contains? body '(check-superuser))
        (contains? body '(api/check-superuser)))))

(defn route-dox
  "Generate a documentation string for a `defendpoint` route."
  [method route docstr args param->schema body]
  (format-route-dox (endpoint-name method route)
                    (str docstr (when (contains-superuser-check? body)
                                  "\n\nYou must be a superuser to do this."))
                    (merge (args-form-symbols args)
                           param->schema)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          AUTO-PARSING + ROUTE TYPING                                           |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn parse-int
  "Parse VALUE (presumabily a string) as an Integer, or throw a 400 exception. Used to automatically to parse `id`
  parameters in `defendpoint` functions."
  [^String value]
  (try (Integer/parseInt value)
       (catch NumberFormatException _
         (throw (ex-info (format "Not a valid integer: '%s'" value) {:status-code 400})))))

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
  "Return a key into `*auto-parse-types*` if ARG has a matching pattern in `auto-parse-arg-name-patterns`.

    (arg-type :id) -> :int"
  [arg]
  (some (fn [[pattern type]]
          (when (re-find pattern (name arg))
            type))
        auto-parse-arg-name-patterns))


;;; ## TYPIFY-ROUTE

(defn route-param-regex
  "If keyword ARG has a matching type, return a pair like `[arg route-param-regex]`,where ROUTE-PARAM-REGEX is the
  regex that this param that arg must match.

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
       (map second)
       (map keyword)))

(defn typify-args
  "Given a sequence of keyword ARGS, return a sequence of `[:arg pattern :arg pattern ...]` for args that have
  matching types."
  [args]
  (->> args
       (mapcat route-param-regex)
       (filterv identity)))

(defn typify-route
  "Expand a ROUTE string like \"/:id\" into a Compojure route form that uses regexes to match parameters whose name
  matches a regex from `auto-parse-arg-name-patterns`.

    (typify-route \"/:id/card\") -> [\"/:id/card\" :id #\"[0-9]+\"]"
  [route]
  (if (vector? route)
    route
    (let [arg-types (typify-args (route-arg-keywords route))]
      (if (empty? arg-types)
        route
        (apply vector route arg-types)))))


;;; ## ROUTE ARG AUTO PARSING

(defn let-form-for-arg
  "Given an ARG-SYMBOL like `id`, return a pair like `[id (Integer/parseInt id)]` that can be used in a `let` form."
  [arg-symbol]
  (when (symbol? arg-symbol)
    (some-> (arg-type arg-symbol)                                     ; :int
            *auto-parse-types*                                        ; {:parser ... }
            :parser                                                   ; Integer/parseInt
            ((fn [parser] `(when ~arg-symbol (~parser ~arg-symbol)))) ; (when id (Integer/parseInt id))
            ((partial vector arg-symbol)))))                          ; [id (Integer/parseInt id)]

(defmacro auto-parse
  "Create a `let` form that applies corresponding parse-fn for any symbols in ARGS that are present in
  `*auto-parse-types*`."
  {:style/indent 1}
  [args & body]
  (let [let-forms (->> args
                       (mapcat let-form-for-arg)
                       (filter identity))]
    `(let [~@let-forms]
       ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               EXCEPTION HANDLING                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

;; TODO - this SHOULD all be implemented as middleware instead
(defn- api-exception-response
  "Convert an exception from an API endpoint into an appropriate HTTP response."
  [^Throwable e]
  (let [{:keys [status-code], :as info} (ex-data e)
        other-info                      (dissoc info :status-code)
        message                         (.getMessage e)]
    {:status (or status-code 500)
     :body   (cond
               ;; Exceptions that include a status code *and* other info are things like Field validation exceptions.
               ;; Return those as is
               (and status-code
                    (seq other-info))
               other-info
               ;; If status code was specified but other data wasn't, it's something like a 404. Return message as the
               ;; body.
               status-code
               message
               ;; Otherwise it's a 500. Return a body that includes exception & filtered stacktrace for debugging
               ;; purposes
               :else
               (let [stacktrace (u/filtered-stacktrace e)]
                 (merge (assoc other-info
                          :message    message
                          :stacktrace stacktrace)
                        (when (instance? SQLException e)
                          {:sql-exception-chain (str/split (with-out-str (jdbc/print-sql-exception-chain e))
                                                           #"\s*\n\s*")}))))}))

(def ^:dynamic ^Boolean *automatically-catch-api-exceptions*
  "Should API exceptions automatically be caught? By default, this is `true`, but this can be disabled when we want to
  catch Exceptions and return something generic to avoid leaking information, e.g. with the `api/public` and
  `api/embed` endpoints. generic exceptions"
  true)

(defn do-with-caught-api-exceptions
  "Execute F with and catch any exceptions, converting them to the appropriate HTTP response."
  [f]
  (if-not *automatically-catch-api-exceptions*
    (f)
    (try (f)
         (catch Throwable e
           (api-exception-response e)))))

(defmacro catch-api-exceptions
  "Execute BODY, and if an exception is thrown, return the appropriate HTTP response."
  {:style/indent 0}
  [& body]
  `(do-with-caught-api-exceptions (fn [] ~@body)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                PARAM VALIDATION                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn validate-param
  "Validate a parameter against its respective schema, or throw an Exception."
  [field-name value schema]
  (try (s/validate schema value)
       (catch Throwable e
         (throw (ex-info (format "Invalid field: %s" field-name)
                  {:status-code 400
                   :errors      {(keyword field-name) (or (su/api-error-message schema)
                                                          (:message (ex-data e))
                                                          (.getMessage e))}})))))

(defn validate-params
  "Generate a series of `validate-param` calls for each param and schema pair in PARAM->SCHEMA."
  [param->schema]
  (for [[param schema] param->schema]
    `(validate-param '~param ~param ~schema)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      Functions for streaming JSON responses                                    |
;;; +----------------------------------------------------------------------------------------------------------------+


(defn- call-on-first-row
  "Calls `f` on the first row seen, acts as a no-op after"
  [f]
  (let [seen-first-row? (volatile! false)]
    (fn [row]
      (if @seen-first-row?
        row
        (do
          (f row)
          (vreset! seen-first-row? true)
          row)))))

(defn- json-piped-input-stream
  "Ensures the response includes the JSON content type. This is needed as the body is an input stream and could be
  interpretted as anything."
  [f]
  (rr/content-type {:status 200
                    :body (rui/piped-input-stream f)}
                   "application/json; charset=utf-8"))

(defn- serialize-to-piped-input-stream
  "Applies `transducer` to the reducible query results `reducible-q`. Serializes the results as JSON to a
  PipedOutputStream. Returns the connected PipedInputStream as the body of a response map. Will call `on-first-row`
  once the first row has be retrieved from `reducible-q` and calls `on-error` if an error occurs."
  [on-first-row on-error query-eduction]
  (json-piped-input-stream
   ;; This function will be invoked in a future and run in a different thread
   (fn [^OutputStream output-stream]
     (with-open [output-writer                 (OutputStreamWriter. ^OutputStream output-stream ^Charset StandardCharsets/UTF_8)
                 buffered-writer               (BufferedWriter. output-writer)
                 ^JsonGenerator json-generator (json/create-generator buffered-writer)]
       (try
         ;; We're always going to return a seq of objects, writing them in this way is the fastest way I've found
         (.writeStartArray json-generator)
         ;; This is a side-affecty way to run a reducible
         (run! #(json-gen/encode-map % json-generator)
               ;; This eduction will help us know that we've successfully executed a query and recevied a result from
               ;; the result set. Up to this point, we have established a connection to the database but not run the
               ;; query. We'll check for the first row first before running the `transducer` on the results
               (eduction (map (call-on-first-row on-first-row)) query-eduction))

         ;; If an exception has occured, let `on-error`
         (catch Exception e
           (on-error e))
         (finally
           ;; Make sure we finish serializing the array
           (.writeEndArray json-generator)
           ;; Not sure if this is necessary, Cheshire does it
           (.flush json-generator)))))))

(defn- throw-if-exception
  "Awaits delivery of the promise `p`. If an Exception is found, throw it."
  [p]
  (when (instance? Exception @p)
    (throw @p)))

(defn- make-error-handler
  "Ensures the error is handled via delivering it to the promise `p`, or logged"
  [p]
  (fn [ex]
    ;; If `p` is realized, we've already received the first row and possibly serialized some results
    (if (realized? p)
      ;; Since results are already being delivered, write the error to the log and throw, best I can tell at this
      ;; stage nothing above will log the message as it is outside of our handlers
      (do
        (log/error ex "Error while streaming results for response")
        (throw ex))
      ;; The error occured before we have received any results from the query, deliver the exception so that an error
      ;; response can be returned
      (deliver p ex))))

(s/defn eduction->piped-streaming-response
  "Takes a thunk that returns an `eduction` when invoked. Will return a ring response with a PipedInputStream,
  serializing the `eduction` to JSON to that stream."
  [query-result :- clojure.core.Eduction]
  (let [p        (promise)
        response (serialize-to-piped-input-stream #(deliver p %) (make-error-handler p) query-result)]

    ;; Block until a row or an exception has been delivered to `p`. This will catch something like SQL query that
    ;; fails to compile or references something that doesn't exist and allow that exception to be returned as if the
    ;; query was running in the HTTP thread.
    (throw-if-exception p)
    response))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                      MISC. OTHER FNS USED BY DEFENDPOINT                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn. Name is just METHOD + ROUTE with slashes
  replaced by underscores.

    (route-fn-name GET \"/:id\") ;-> GET_:id"
  [method route]
  ;; if we were passed a vector like [":id" :id #"[0-9+]"] only use first part
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (^String .replace "/" "_")
        symbol)))

(defn wrap-response-if-needed
  "If RESPONSE isn't already a map with keys `:status` and `:body`, wrap it in one (using status 200)."
  [response]
  ;; Not sure why this is but the JSON serialization middleware barfs if response is just a plain boolean
  (when (m/boolean? response)
    (throw (Exception. "Attempted to return a boolean as an API response. This is not allowed!")))
  (if (and (map? response)
           (contains? response :status)
           (contains? response :body))
    response
    {:status 200
     :body   response}))
