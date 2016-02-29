(ns metabase.api.common.internal
  "Internal functions used by `metabase.api.common`."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [swiss.arrows :refer :all]
            [metabase.util :as u]))

;;; # DEFENDPOINT HELPER FUNCTIONS + MACROS

;;; ## DOCUMENTATION GENERATION

(defn- full-route-string
  "Generate a string like `GET /api/meta/db/:id` for a defendpoint route."
  [method route]
  (let [route (if (vector? route) (first route) route)
        ns-str (-<>> (.getName *ns*)                 ; 'metabase.api.card
                     name                            ; "metabase.api.card"
                     (clojure.string/split <> #"\.") ; ["metabase" "api" "card"]
                     rest                            ; ["api" "card"]
                     (interpose "/")                 ; ["api" "/" "card"]
                     (apply str))]                   ; "api/card"
    (format "%s /%s%s" (name method) ns-str route))) ; "GET /api/card:id"

(defn- dox-for-annotation
  "Look up the docstr for annotation."
  [annotation]
  {:pre [(symbol? annotation)]}
  (let [annotation-name (name annotation)]
    {annotation-name (->> (str "annotation:" annotation-name)
                          symbol
                          (ns-resolve *ns*)
                          meta
                          :doc)}))

(defn- args-form-flatten
  "A version of `flatten` that will actually flatten a form such as:

    [id :as {{:keys [dataset_query description display name public_perms visualization_settings]} :body}]"
  [form]
  (cond
    (map? form) (args-form-flatten (mapcat (fn [[k v]]
                                          [(args-form-flatten k) (args-form-flatten v)])
                                        form))
    (sequential? form) (mapcat args-form-flatten form)
    :else       [form]))

(defn- args-form-symbols
  [form]
  (->> (args-form-flatten form)
       (filter symbol?)
       (map #(vector % nil))
       (into {})))

(defn- get-annotation-dox
  "Produce a map of `annotation -> documentation` for ANNOTATIONS, which may be either a symbol or sequence of symbols."
  [annotations]
  (->> annotations
       (m/map-vals (fn [annotations]
                     (if (sequential? annotations) annotations
                         [annotations])))
       (map (fn [[param annotations]]
              {param (->> annotations
                          (map dox-for-annotation)
                          (into {}))}))
       (into {})))

(defn- format-route-dox
  "Return a markdown-formatted string to be used as documentation for a `defendpoint` function."
  [route-str docstr params-map]
  (str (format "`%s`" route-str)
       (when (seq docstr)
         (str "\n\n" docstr))
       (when (seq params-map)
         (str "\n\n##### PARAMS:\n\n"
              (->> params-map
                   (map (fn [[param annotations-map]]
                          (apply str (format "*  `%s`\n" (name param))
                                 (map (fn [[annotation annotation-dox]]
                                        (format "   *  *%s* %s\n"
                                                (name annotation)
                                                (or annotation-dox
                                                    "*[undocumented annotation]*")))
                                      annotations-map))))
                   (apply str))))))

(defn route-dox
  "Generate a documentation string for a `defendpoint` route."
  [method route docstr args annotations]
  (format-route-dox (full-route-string method route)
                    docstr
                    (merge (args-form-symbols args)
                           (get-annotation-dox annotations))))


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

(defn parse-int
  "Parse VALUE (presumabily a string) as an Integer, or throw a 400 exception.
   Used to automatically to parse `id` parameters in `defendpoint` functions."
  [^String value]
  (try (Integer/parseInt value)
       (catch java.lang.NumberFormatException _
         (throw (ex-info (format "Not a valid integer: '%s'" value) {:status-code 400})))))

(def ^:dynamic *auto-parse-types*
  "Map of `param-type` -> map with the following keys:

     :route-param-regex Regex pattern that should be used for params in Compojure route forms
     :parser            Function that should be used to parse args"
  {:int  {:route-param-regex #"[0-9]+"
          :parser            'metabase.api.common.internal/parse-int}
   :uuid {:route-param-regex #"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}"
          :parser            nil}})

(def ^:private ^:const  auto-parse-arg-name-patterns
  "Sequence of `[param-pattern parse-type]` pairs.
   A param with name matching PARAM-PATTERN should be considered to be of AUTO-PARSE-TYPE."
  [[#"^uuid$"       :uuid]
   [#"^session_id$" :uuid]
   [#"^[\w-_]*id$"  :int]])

(defn arg-type
  "Return a key into `*auto-parse-types*` if ARG has a matching pattern in `auto-parse-arg-name-patterns`.

    (arg-type :id) -> :int"
  [arg]
  (-> auto-parse-arg-name-patterns
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
       (map second)
       (map keyword)))

(defn typify-args
  "Given a sequence of keyword ARGS, return a sequence of `[:arg pattern :arg pattern ...]`
   for args that have matching types."
  [args]
  (->> args
       (mapcat route-param-regex)
       (filterv identity)))

(defn typify-route
  "Expand a ROUTE string like \"/:id\" into a Compojure route form that uses regexes to match
   parameters whose name matches a regex from `auto-parse-arg-name-patterns`.

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

(defn wrap-catch-api-exceptions
  "Run F in a try-catch block, and format any caught exceptions as an API response."
  [f]
  (try (f)
       (catch Throwable e
         (let [{:keys [status-code], :as info} (ex-data e)
               other-info                      (dissoc info :status-code)
               message                         (.getMessage e)]
           {:status (or status-code 500)
            :body   (cond
                      ;; Exceptions that include a status code *and* other info are things like Field validation exceptions.
                      ;; Return those as is
                      (and status-code
                           (seq other-info)) other-info
                      ;; If status code was specified but other data wasn't, it's something like a 404. Return message as the body.
                      status-code            message
                      ;; Otherwise it's a 500. Return a body that includes exception & filtered stacktrace for debugging purposes
                      :else                  (let [stacktrace (u/filtered-stacktrace e)]
                                               (log/debug message "\n" (u/pprint-to-str stacktrace))
                                               (assoc other-info
                                                      :message message
                                                      :stacktrace stacktrace)))}))))

(defmacro catch-api-exceptions
  "Execute BODY, and if an exception is thrown, return the appropriate HTTP response."
  [& body]
  `(wrap-catch-api-exceptions
     (fn [] ~@body)))

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

(defn arg-annotation-let-binding
  "Return a pair like `[arg-symb arg-annotation-form]`, where `arg-annotation-form` is the result of calling the `arg-annotation-fn` implementation
   for ANNOTATION-KW."
  [[annotation-kw arg-symb]] ; dispatch-fn passed as a param to avoid circular dependencies
  {:pre [(keyword? annotation-kw)
         (symbol? arg-symb)]}
  `[~arg-symb (~((resolve 'metabase.api.common/-arg-annotation-fn) annotation-kw) '~arg-symb ~arg-symb)])

(defn process-arg-annotations
  "Internal function used by `defendpoint` for handling a parameter annotations map. Don't call this directly! "
  [annotations-map]
  {:pre [(or (nil? annotations-map)
             (map? annotations-map))]}
  (some->> annotations-map
           (mapcat (fn [[arg annotations]]
                     {:pre [(symbol? arg)
                            (or (symbol? annotations)
                                (every? symbol? annotations))]}
                     (if (sequential? annotations) (->> annotations
                                                        (map keyword)
                                                        (map (u/rpartial vector arg)))
                         [[(keyword annotations) arg]])))
           (mapcat arg-annotation-let-binding)))

(defmacro let-annotated-args
  "Wrap BODY in a let-form that calls corresponding implementations of `arg-annotation-fn` for annotated args in ANNOTATED-ARGS-FORM."
  [arg-annotations & body]
  {:pre [(or (nil? arg-annotations)
             (map? arg-annotations))]}
  (let [annotations (process-arg-annotations arg-annotations)]
    (if (seq annotations)
      `(let [~@annotations]
         ~@body)
      `(do ~@body))))
