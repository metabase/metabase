(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [clojure.tools.logging :as log]
            (clojure [string :as s]
                     [walk :as walk])
            [cheshire.core :as json]
            [compojure.core :refer [defroutes]]
            [medley.core :as m]
            [metabase.api.common.internal :refer :all]
            [metabase.db :as db]
            [metabase.models.interface :as models]
            [metabase.util :as u]
            [metabase.util.password :as password]))

(declare check-403 check-404)

;;; ## DYNAMIC VARIABLES
;; These get bound by middleware for each HTTP request.

(def ^:dynamic ^Integer *current-user-id*
  "Int ID or `nil` of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Delay that returns the `User` (or nil) associated with the current API call.
   ex. `@*current-user*`"
  (atom nil)) ; default binding is just something that will return nil when dereferenced

(def ^:dynamic ^Boolean *is-superuser?*
  "Is the current user a superuser?"
  false)

(def ^:dynamic *current-user-permissions-set*
  "Delay to the set of permissions granted to the current user."
  (atom #{}))


;;; ## CONDITIONAL RESPONSE FUNCTIONS / MACROS

(defn check
  "Assertion mechanism for use inside API functions.
   Checks that TEST is true, or throws an `ExceptionInfo` with STATUS-CODE and MESSAGE.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is generated.

  `check` can be called with the form

      (check test code message)

  or with the form

      (check test [code message])

  You can also include multiple tests in a single call:

    (check test1 code1 message1
           test2 code2 message2)"
  ([tst code-or-code-message-pair & rest-args]
   (let [[[code message] rest-args] (if (vector? code-or-code-message-pair)
                                      [code-or-code-message-pair rest-args]
                                      [[code-or-code-message-pair (first rest-args)] (rest rest-args)])]
     (when-not tst
       (throw (ex-info message {:status-code code})))
     (if (empty? rest-args) tst
         (recur (first rest-args) (second rest-args) (drop 2 rest-args))))))

(defn check-exists?
  "Check that object with ID exists in the DB, or throw a 404."
  [entity id]
  (check-404 (db/exists? entity, :id id)))

(defn check-superuser
  "Check that `*current-user*` is a superuser or throw a 403. This doesn't require a DB call."
  []
  (check-403 *is-superuser?*))


;;; #### checkp- functions: as in "check param". These functions expect that you pass a symbol so they can throw exceptions w/ relevant error messages.

(defn throw-invalid-param-exception
  "Throw an `ExceptionInfo` that contains information about an invalid API params in the expected format."
  [field-name message]
  (throw (ex-info (format "Invalid field: %s" field-name)
           {:status-code 400
            :errors      {(keyword field-name) message}})))

(defn checkp
  "Assertion mechanism for use inside API functions that validates individual input params.
   Checks that TEST is true, or throws an `ExceptionInfo` with FIELD-NAME and MESSAGE.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is generated.

  `checkp` can be called with the form

      (checkp test field-name message)"
  ([tst field-name message]
   (when-not tst
     (throw-invalid-param-exception (str field-name) message))))

(defn checkp-with
  "Check (F VALUE), or throw an exception with STATUS-CODE (default is 400).
   SYMB is passed in order to give the user a relevant error message about which parameter was bad.

   Returns VALUE upon success.

    (checkp-with (partial? contains? {:all :mine}) f :all)
      -> :all
    (checkp-with (partial? contains {:all :mine}) f :bad)
      -> ExceptionInfo: Invalid value ':bad' for 'f': test failed: (partial? contains?) {:all :mine}

   You may optionally pass a MESSAGE to append to the exception upon failure;
   this will be used in place of the \"test failed: ...\" message.

   MESSAGE may be either a string or a pair like `[status-code message]`."
  ([f symb value]
   (checkp-with f symb value (str "test failed: " f)))
  ([f symb value message]
   {:pre [(symbol? symb)]}
   (checkp (f value) symb (format "Invalid value '%s' for '%s': %s" (str value) symb message))
   value))

(defn checkp-contains?
  "Check that the VALUE of parameter SYMB is in VALID-VALUES, or throw a 400.
   Returns VALUE upon success.

    (checkp-contains? #{:fav :all :mine} 'f f)
    -> (check (contains? #{:fav :all :mine} f)
         [400 (str \"Invalid value '\" f \"' for 'f': must be one of: #{:fav :all :mine}\")])"
  [valid-values-set symb value]
  {:pre [(set? valid-values-set) (symbol? symb)]}
  (checkp-with (partial contains? valid-values-set) symb value (str "must be one of: " valid-values-set)))


;;; #### api-let, api->, etc.

;; The following all work exactly like the corresponding Clojure versions
;; but take an additional arg at the beginning called RESPONSE-PAIR.
;; RESPONSE-PAIR is of the form `[status-code message]`.
;; ex.
;;
;;     (let [binding x] ...) -> (api-let [500 \"Not OK!\"] [binding x] ...)

(defmacro api-let
  "If TEST is true, bind it to BINDING and evaluate BODY.

    (api-let [404 \"Not found.\"] [user @*current-user*]
      (:id user))"
  {:arglists '([[status-code message] [binding test] & body])}
  [response-pair [binding test & more] & body]
  (if (seq more)
    `(api-let ~response-pair ~[binding test]
       (api-let ~response-pair ~more
         ~@body))
    `(let [test# ~test] ; bind ~test so doesn't get evaluated more than once (e.g. in case it's an expensive funcall)
       (check test# ~response-pair)
       (let [~binding test#
             ~@more]
         ~@body))))

(defmacro api->
  "If TEST is true, thread the result using `->` through BODY.

    (api-> [404 \"Not found\"] @*current-user*
      :id)"
  [response-pair tst & body]
  `(api-let ~response-pair [result# ~tst]
     (-> result#
         ~@body)))

(defmacro api->>
  "Like `api->`, but threads result using `->>`."
  [response-pair tst & body]
  `(api-let ~response-pair [result# ~tst]
     (->> result#
          ~@body)))


;;; ### GENERIC RESPONSE HELPERS
;; These are basically the same as the `api-` versions but with RESPONSE-PAIR already bound

;; #### GENERIC 400 RESPONSE HELPERS
(def ^:private ^:const generic-400 [400 "Invalid Request."])
(defn     check-400 "Throw a `400` if ARG is `false` or `nil`, otherwise return as-is."                     [arg]    (check arg generic-400))
(defmacro let-400   "Bind a form as with `let`; throw a 400 if it is `nil` or `false`."                     [& body] `(api-let   ~generic-400 ~@body))
(defmacro ->400     "If form is `nil` or `false`, throw a 400; otherwise thread it through BODY via `->`."  [& body] `(api->     ~generic-400 ~@body))
(defmacro ->>400    "If form is `nil` or `false`, throw a 400; otherwise thread it through BODY via `->>`." [& body] `(api->>    ~generic-400 ~@body))

;; #### GENERIC 404 RESPONSE HELPERS
(def ^:private ^:const generic-404 [404 "Not found."])
(defn     check-404 "Throw a `404` if ARG is `false` or `nil`, otherwise return as-is."                     [arg]    (check arg generic-404))
(defmacro let-404   "Bind a form as with `let`; throw a 404 if it is `nil` or `false`."                     [& body] `(api-let   ~generic-404 ~@body))
(defmacro ->404     "If form is `nil` or `false`, throw a 404; otherwise thread it through BODY via `->`."  [& body] `(api->     ~generic-404 ~@body))
(defmacro ->>404    "If form is `nil` or `false`, throw a 404; otherwise thread it through BODY via `->>`." [& body] `(api->>    ~generic-404 ~@body))

;; #### GENERIC 403 RESPONSE HELPERS
;; If you can't be bothered to write a custom error message
(def ^:private ^:const generic-403 [403 "You don't have permissions to do that."])
(defn     check-403 "Throw a `403` if ARG is `false` or `nil`, otherwise return as-is."                     [arg]     (check arg generic-403))
(defmacro let-403   "Bind a form as with `let`; throw a 403 if it is `nil` or `false`."                     [& body] `(api-let   ~generic-403 ~@body))
(defmacro ->403     "If form is `nil` or `false`, throw a 403; otherwise thread it through BODY via `->`."  [& body] `(api->     ~generic-403 ~@body))
(defmacro ->>403    "If form is `nil` or `false`, throw a 403; otherwise thread it through BODY via `->>`." [& body] `(api->>    ~generic-403 ~@body))

;; #### GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def ^:private ^:const generic-500 [500 "Internal server error."])
(defn     check-500 "Throw a `500` if ARG is `false` or `nil`, otherwise return as-is."                     [arg]    (check arg generic-500))
(defmacro let-500   "Bind a form as with `let`; throw a 500 if it is `nil` or `false`."                     [& body] `(api-let   ~generic-500 ~@body))
(defmacro ->500     "If form is `nil` or `false`, throw a 500; otherwise thread it through BODY via `->`."  [& body] `(api->     ~generic-500 ~@body))
(defmacro ->>500    "If form is `nil` or `false`, throw a 500; otherwise thread it through BODY via `->>`." [& body] `(api->>    ~generic-500 ~@body))


;;; ## DEFENDPOINT AND RELATED FUNCTIONS


;;; ### Arg annotation fns

(defmulti ^{:doc "*Internal* - don't use this directly.

                  Multimethod used internally to dispatch arg annotation functions.
                  Dispatches on the arg annotation as a keyword.

                   {id Required}
                   -> ((-arg-annotation-fn :Required) 'id id)
                   -> (annotation:Required 'id id)"} -arg-annotation-fn ; for some reason supplying a docstr the normal way doesn't assoc it with the metadata like we'd expect
  (fn [annotation-kw]
    {:pre [(keyword? annotation-kw)]}
    annotation-kw))

;; By default, throw an exception if we see an arg annotation we don't understand
(defmethod -arg-annotation-fn :default [annotation-kw]
  (throw (Exception. (format "Don't know what to do with arg annotation '%s'!" (name annotation-kw)))))

;; ### defannotation

(defmacro defannotation
  "Convenience for defining a new `defendpoint` arg annotation.

    (defannotation Required
      \"Param must be non-nil.\"
      [symb value]
      (when-not value
        (throw (ex-info (format \"'%s' is a required param.\" symb) {:status-code 400})))
      value)

   SYMBOL-BINDING is bound to the *symbol* of the annotated API arg (e.g., `'org`).
   This is useful for returning relevant error messages to the user (see example above).

   VALUE-BINDING is bound to the *value* of the annotated API arg (e.g., `1`).

   You may optionally specify that the param is `:nillable`.
   This means BODY will only be evaluated if VALUE is non-nil.

    (defannotation CardFilterOption [symb value :nillable]
      (checkp-contains? #{:all :mine :fav} symb (keyword value)))

   Internally, `defannotation` creates a function with the name of the annotation prefixed by `annotation:`.
   This can be used to test the annotation:

    (annotation:Required org 100) -> 100
    (annotation:Required org nil) -> exception: 'org' is a required param.

   You can also use it inside the body of another annotation:

    (defannotation PublicPerm [symb value :nillable]
      (annotation:Integer symb value]
      (checkp-contains? #{0 1 2} symb value))

   Try to add a docstr for all annotations. When they exist, they'll be included in the API documentation for
   all parameters that use them. A good annotation docstr should explain what the valid values for the param are."
  {:arglists '([annotation-name docstr? [symbol-binding value-binding nillable?] & body])}
  [annotation-name & args]
  {:pre [(symbol? annotation-name)]}
  (let [[docstr [[symbol-binding value-binding & [nillable?]] & body]] (u/optional string? args)]
    (assert (symbol? symbol-binding))
    (assert (symbol? value-binding))
    (assert (or (nil? nillable?)
                (= nillable? :nillable)))
    (when-not docstr
      (log/warn (format "Warning: annotation %s/%s does not have a docstring." (.getName *ns*) annotation-name)))
    (let [fn-name (symbol (str "annotation:" annotation-name))]
      `(do
         (defn ~fn-name ~@(when docstr [docstr]) [~symbol-binding ~value-binding]
           {:pre [(symbol? ~symbol-binding)]}
           ~(if nillable?
              `(when-not (nil? ~value-binding)
                 ~@body)
              `(do
                 ~@body)))
         (defmethod -arg-annotation-fn ~(keyword annotation-name) [~'_]
           ~fn-name)))))

;; ### common annotation definitions

(defannotation Required
  "Param may not be `nil`."
  [symb value]
  (u/prog1 value
    (when (nil? value)
      (throw-invalid-param-exception (name symb) "field is a required param."))))

(defannotation Date
  "Parse param string as an [ISO 8601 date](http://en.wikipedia.org/wiki/ISO_8601), e.g.
   `2015-03-24T06:57:23+00:00`"
  [symb value :nillable]
  (try (u/->Timestamp value)
       (catch Throwable _
         (throw-invalid-param-exception (name symb) (format "'%s' is not a valid date." value)))))

(defannotation String->Integer
  "Param is converted from a string to an integer."
  [symb value :nillable]
  (try (Integer/parseInt value)
       (catch java.lang.NumberFormatException _
         (format "Invalid value '%s' for '%s': cannot parse as an integer." value symb)))) ; TODO - why aren't we re-throwing these exceptions ?

(defannotation String->Dict
  "Param is converted from a JSON string to a dictionary."
  [symb value :nillable]
  (try (walk/keywordize-keys (json/parse-string value))
       (catch java.lang.Exception _
         (format "Invalid value '%s' for '%s': cannot parse as json." value symb))))

(defannotation String->Boolean
  "Param is converted from `\"true\"` or `\"false\"` to the corresponding boolean."
  [symb value :nillable]
  (cond
    (= value "true")  true
    (= value "false") false
    (nil? value)      nil
    :else             (throw-invalid-param-exception (name symb) (format "'%s' is not a valid boolean." value))))

(defannotation Integer
  "Param must be an integer (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with integer? symb value "value must be an integer."))

(defannotation Boolean
  "Param must be a boolean (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with m/boolean? symb value "value must be a boolean."))

(defannotation Dict
  "Param must be a dictionary (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with map? symb value "value must be a dictionary."))

(defannotation ArrayOfIntegers
  "Param must be an array of integers (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with vector? symb value "value must be an array.")
  (mapv #(checkp-with integer? symb % "array value must be a integer.") value))

(defannotation ArrayOfStrings
  "Param must be an array of strings (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with vector? symb value "value must be an array.")
  (mapv #(checkp-with string? symb % "array value must be a string.") value))

(defannotation ArrayOfMaps
  "Param must be an array of maps (this does *not* cast the param)."
  [symb value :nillable]
  (checkp-with vector? symb value "value must be an array.")
  (mapv #(checkp-with map? symb % "array value must be a map.") value))

(defannotation NonEmptyString
  "Param must be a non-empty string (strings that only contain whitespace are considered empty)."
  [symb value :nillable]
  (checkp-with (complement s/blank?) symb value "value must be a non-empty string."))

(defannotation ^:deprecated PublicPerms
  "Param must be an integer and either `0` (no public permissions), `1` (public may read), or `2` (public may read and write)."
  [symb value :nillable]
  (annotation:Integer symb value)
  (checkp-contains? #{0 1 2} symb value))

(defannotation Email
  "Param must be a valid email address."
  [symb value :nillable]
  (checkp-with u/is-email? symb value "Not a valid email address."))

(defannotation ComplexPassword
  "Param must be a complex password (*what does this mean?*)"
  [symb value]
  (checkp (password/is-complex? value) symb "Insufficient password strength")
  value)

(defannotation FilterOptionAllOrMine
  "Param must be either `all` or `mine`."
  [symb value :nillable]
  (checkp-contains? #{:all :mine} symb (keyword value)))

;;; ### defendpoint

(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via `Integer/parseInt`
   -  converts ROUTE from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`
   -  sequentially applies specified annotation functions on args to validate or cast them.
   -  executes BODY inside a `try-catch` block that handles exceptions; if exception is an instance of `ExceptionInfo` and includes a `:status-code`,
      that code will be returned
   -  automatically calls `wrap-response-if-needed` on the result of BODY
   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below)
      will automatically include the function in the generated `defroutes` form.
   -  Generates a super-sophisticated Markdown-formatted docstring"
  {:arglists '([method route docstr? args annotations-map? & body])}
  [method route & more]
  {:pre [(or (string? route)
             (vector? route))]}
  (let [fn-name               (route-fn-name method route)
        route                  (typify-route route)
        [docstr [args & more]] (u/optional string? more)
        _                      (when-not docstr
                                 (log/warn (format "Warning: endpoint %s/%s does not have a docstring." (ns-name *ns*) fn-name)))
        [arg-annotations body] (u/optional #(and (map? %) (every? symbol? (keys %))) more)]
    `(def ~(vary-meta fn-name assoc
                      :doc (route-dox method route docstr args arg-annotations)
                      :is-endpoint? true)
       (~method ~route ~args
                (catch-api-exceptions
                  (auto-parse ~args
                    (let-annotated-args ~arg-annotations
                                        (-> (do ~@body)
                                            wrap-response-if-needed))))))))

(defmacro define-routes
  "Create a `(defroutes routes ...)` form that automatically includes all functions created with
   `defendpoint` in the current namespace."
  [& additional-routes]
  (let [api-routes (for [[symb varr] (ns-publics *ns*)
                         :when       (:is-endpoint? (meta varr))]
                     symb)]
    `(defroutes ~(vary-meta 'routes assoc :doc (format "Ring routes for %s:\n%s"
                                                       (-> (ns-name *ns*)
                                                           (s/replace #"^metabase\." "")
                                                           (s/replace #"\." "/"))
                                                       (u/pprint-to-str (concat api-routes additional-routes))))
       ~@api-routes ~@additional-routes)))

(defn read-check
  "Check whether we can read an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  ([obj]
   (check-404 obj)
   (check-403 (models/can-read? obj))
   obj)
  ([entity id]
   (read-check (entity id))))

(defn write-check
  "Check whether we can write an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  ([obj]
   (check-404 obj)
   (check-403 (models/can-write? obj))
   obj)
  ([entity id]
   (write-check (entity id))))
