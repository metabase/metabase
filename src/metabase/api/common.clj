(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [clojure.data.json :as json]
            [compojure.core :refer [defroutes]]
            [korma.core :refer :all :exclude [update]]
            [medley.core :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.db :refer :all]
            [metabase.db.internal :refer [entity->korma]]
            [metabase.util :as u]
            [metabase.util.password :as password])
  (:import com.metabase.corvus.api.ApiException))

(declare check-403
         check-404)

;;; ## DYNAMIC VARIABLES
;; These get bound by middleware for each HTTP request.

(def ^:dynamic *current-user-id*
  "Int ID or `nil` of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Delay that returns the `User` (or nil) associated with the current API call.
   ex. `@*current-user*`"
  (atom nil)) ; default binding is just something that will return nil when dereferenced


;;; ## GENERAL HELPER FNS / MACROS

;; TODO - move this to something like `metabase.util.debug`
(defmacro with-current-user
  "Primarily for debugging purposes. Evaulates BODY as if `*current-user*` was the User with USER-ID."
  [user-id & body]
  `(binding [*current-user-id* ~user-id
             *current-user* (delay (sel :one 'metabase.models.user/User :id ~user-id))]
     ~@body))

(defn current-user-perms-for-org
  "TODO - A very similar implementation exists in `metabase.models`. Find some way to combine them."
  [org-id]
  (when *current-user-id*
    (let [[{org-id :id
            [{admin? :admin}] :org-perms}] (select (-> (entity->korma 'metabase.models.org/Org)                ; this is a complicated join but Org permissions checking
                                                       (entity-fields [:id]))                                  ; is a very common case so optimization is worth it here
                                                   (where {:id org-id})
                                                   (with (-> (entity->korma 'metabase.models.org-perm/OrgPerm)
                                                             (entity-fields [:admin]))
                                                         (where {:organization_id org-id
                                                                 :user_id *current-user-id*})))
            superuser? (sel :one :field ['metabase.models.user/User :is_superuser] :id *current-user-id*)]
      (check-404 org-id)
      (cond
        superuser?      :admin
        admin?          :admin
        (false? admin?) :default ; perm still exists but admin = false
        :else           nil))))

(defmacro org-perms-case
  "Evaluates BODY inside a case statement based on `*current-user*`'s perms for Org with ORG-ID.
   Case will be `nil`, `:default`, or `:admin`."
  [org-id & body]
  `(case (current-user-perms-for-org ~org-id)
     ~@body))


;;; ## CONDITIONAL RESPONSE FUNCTIONS / MACROS

(defn check
  "Assertion mechanism for use inside API functions.
   Checks that TEST is true, or throws an `ApiException` with STATUS-CODE and MESSAGE.

  This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is generated.

  `check` can be called with the form

      (check test code message)

  or with the form

      (check test [code message])

  You can also include multiple tests in a single call:

    (check test1 code1 message1
           test2 code2 message2)"
  ([test code-or-code-message-pair & rest-args]
   (let [[[code message] rest-args] (if (vector? code-or-code-message-pair)
                                      [code-or-code-message-pair rest-args]
                                      [[code-or-code-message-pair (first rest-args)] (rest rest-args)])]
     (when-not test
       (throw (ApiException. (int code) message)))
     (if (empty? rest-args) test
         (recur (first rest-args) (second rest-args) (drop 2 rest-args))))))

(defn check-exists?
  "Check that object with ID exists in the DB, or throw a 404."
  [entity id]
  (check-404 (exists? entity :id id)))

(defn check-superuser
  "Check that `*current-user*` is a superuser or throw a 403."
  []
  (check-403 (:is_superuser @*current-user*)))


;;; #### checkp- functions: as in "check param". These functions expect that you pass a symbol so they can throw ApiExceptions w/ relevant error messages.

(defmacro checkp-with
  "Check (TEST-FN VALUE), or throw an exception with STATUS-CODE (default is 400).
   SYMB is passed in order to give the user a relevant error message about which parameter was bad.

   Returns VALUE upon success.

    (checkp-with (partial? contains? {:all :mine}) f :all)
      -> :all
    (checkp-with (partial? contains {:all :mine}) f :bad)
      -> ApiException: Invalid value ':bad' for 'f': test failed: (partial? contains? {:all :mine}

   You may optionally pass a MESSAGE to append to the ApiException upon failure;
   this will be used in place of the \"test failed: ...\" message.

   MESSAGE may be either a string or a pair like `[status-code message]`."
  ([test-fn symb value message-or-status+message-pair]
   {:pre [(symbol? symb)]}
   `(let [[status-code# message#] (if (string? ~message-or-status+message-pair) [400 ~message-or-status+message-pair]
                                      ~message-or-status+message-pair)
          value# ~value]
      (check (~test-fn value#)
        [status-code# (format "Invalid value '%s' for '%s': %s" (str value#) ~symb message#)])
      value#))
  ([test-fn symb value]
   `(checkp-with ~test-fn ~symb ~value ~(str "test failed: " test-fn))))

(defn checkp-contains?
  "Check that the VALUE of parameter SYMB is in VALID-VALUES, or throw a 400.
   Returns VALUE upon success.

    (checkp-contains? #{:fav :all :mine} 'f f)
    -> (check (contains? #{:fav :all :mine} f)
         [400 (str \"Invalid value '\" f \"' for 'f': must be one of: #{:fav :all :mine}\")])"
  [valid-values-set symb value]
  {:pre [(set? valid-values-set)
         (symbol? symb)]}
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
  [response-pair [binding test] & body]
  `(let [test# ~test] ; bind ~test so doesn't get evaluated more than once (e.g. in case it's an expensive funcall)
     (check test# ~response-pair)
     (let [~binding test#]
       ~@body)))

(defmacro api->
  "If TEST is true, thread the result using `->` through BODY.

    (api-> [404 \"Not found\"] @*current-user*
      :id)"
  [response-pair test & body]
  `(api-let ~response-pair [result# ~test]
     (-> result#
         ~@body)))

(defmacro api->>
  "Like `api->`, but threads result using `->>`."
  [response-pair test & body]
  `(api-let ~response-pair [result# ~test]
     (->> result#
          ~@body)))


;;; ### GENERIC RESPONSE HELPERS
;; These are basically the same as the `api-` versions but with RESPONSE-PAIR already bound

;; #### GENERIC 400 RESPONSE HELPERS
(def generic-400 [400 "Invalid Request."])
(defn     check-400 [test]    (check test generic-400))
(defmacro let-400   [& args] `(api-let   ~generic-400 ~@args))
(defmacro ->400     [& args] `(api->     ~generic-400 ~@args))
(defmacro ->>400    [& args] `(api->>    ~generic-400 ~@args))

;; #### GENERIC 404 RESPONSE HELPERS
(def generic-404 [404 "Not found."])
(defn     check-404 [test]    (check test generic-404))
(defmacro let-404   [& args] `(api-let   ~generic-404 ~@args))
(defmacro ->404     [& args] `(api->     ~generic-404 ~@args))
(defmacro ->>404    [& args] `(api->>    ~generic-404 ~@args))

;; #### GENERIC 403 RESPONSE HELPERS
;; If you can't be bothered to write a custom error message
(def generic-403 [403 "You don't have permissions to do that."])
(defn     check-403 [test]    (check test generic-403))
(defmacro let-403   [& args] `(api-let   ~generic-403 ~@args))
(defmacro ->403     [& args] `(api->     ~generic-403 ~@args))
(defmacro ->>403    [& args] `(api->>    ~generic-403 ~@args))

;; #### GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def generic-500 [500 "Internal server error."])
(defn     check-500 [test]    (check test generic-500))
(defmacro let-500   [& args] `(api-let   ~generic-500 ~@args))
(defmacro ->500     [& args] `(api->     ~generic-500 ~@args))
(defmacro ->>500    [& args] `(api->>    ~generic-500 ~@args))


;;; ## DEFENDPOINT AND RELATED FUNCTIONS


;;; ### Arg annotation fns

(defmulti -arg-annotation-fn
  "*Internal* - don't use this directly.

   Multimethod used internally to dispatch arg annotation functions.
   Dispatches on the arg annotation as a keyword.

    {id Required}
    -> ((-arg-annotation-fn :Required) 'id id)
    -> (annotation:Required 'id id)"
  (fn [annotation-kw]
    {:pre [(keyword? annotation-kw)]}
    annotation-kw))

;; By default, throw an exception if we see an arg annotation we don't understand
(defmethod -arg-annotation-fn :default [annotation-kw]
  (throw (Exception. (format "Don't know what to do with arg annotation '%s'!" (name annotation-kw)))))

;; ### defannotation

(defmacro defannotation
  "Convenience for defining a new `defendpoint` arg annotation.

    (defannotation Required [symb value]
      (when-not value
        (throw (ApiException. 400 (format \"'%s' is a required param.\" symb))))
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
    (annotation:Required org nil) -> ApiException: 'org' is a required param.

   You can also use it inside the body of another annotation:

    (defannotation PublicPerm [symb value :nillable]
      (annotation:Integer symb value]
      (checkp-contains? #{0 1 2} symb value))"
  {:arglists '([annotation-name docstr? [symbol-binding value-binding nillable?] & body])}
  [annotation-name & args]
  {:pre [(symbol? annotation-name)]}
  (let [[docstr [[symbol-binding value-binding & [nillable?]] & body]] (u/optional string? args)]
    (assert (symbol? symbol-binding))
    (assert (symbol? value-binding))
    (assert (or (nil? nillable?)
                (= nillable? :nillable)))
    (let [fn-name (symbol (str "annotation:" annotation-name))]
      `(do
         (defn ~fn-name ~@(when docstr [docstr]) [~symbol-binding ~value-binding]
           {:pre [(symbol? ~symbol-binding)]}
           ~(if nillable?
              `(when ~value-binding
                 ~@body)
              `(do
                 ~@body)))
         (defmethod -arg-annotation-fn ~(keyword annotation-name) [~'_]
           ~fn-name)))))

;; ### common annotation definitions

(defannotation Required
  "Throw a 400 if param is `nil`."
  [symb value]
  (when-not value
    (throw (ApiException. (int 400) (format "'%s' is a required param." symb))))
  value)

(defannotation Date
  "try to parse 'date' string as an ISO-8601 date"
  [symb value :nillable]
  (try (u/parse-iso8601 value)
          (catch Throwable _
            (throw (ApiException. (int 400) (format "'%s' is not a valid date." symb))))))

(defannotation String->Integer [symb value :nillable]
  (try (Integer/parseInt value)
       (catch java.lang.NumberFormatException _
         (format "Invalid value '%s' for '%s': cannot parse as an integer." value symb))))

(defannotation String->Dict [symb value :nillable]
  (try (clojure.walk/keywordize-keys (json/read-str value))
       (catch java.lang.Exception _
         (format "Invalid value '%s' for '%s': cannot parse as json." value symb))))

(defannotation Integer
  "Check that a param is an integer (this does *not* cast the param!)"
  [symb value :nillable]
  (checkp-with integer? symb value "value must be an integer."))

(defannotation Boolean
  "Check that param is a boolean (this does *not* cast the param!)"
  [symb value :nillable]
  (checkp-with boolean? symb value "value must be a boolean."))

(defannotation Dict
  "Check that param is a dictionary (this does *not* cast the param!)"
  [symb value :nillable]
  (checkp-with map? symb value "value must be a dictionary."))

(defannotation ArrayOfIntegers
  "Check that param is an array or Integers (this does *not* cast the param!)"
  [symb value :nillable]
  (checkp-with vector? symb value "value must be an array.")
  (map (fn [v] (checkp-with integer? symb v "array value must be an integer.")) value))

(defannotation NonEmptyString
  "Check that param is a non-empty string (strings that only contain whitespace are considered empty)."
  [symb value :nillable]
  (checkp-with (complement clojure.string/blank?) symb value "value must be a non-empty string."))

(defannotation PublicPerms
  "check that perms is `int` in `#{0 1 2}`"
  [symb value :nillable]
  (annotation:Integer symb value)
  (checkp-contains? #{0 1 2} symb value))

(defannotation Email
  "Check that param is a valid email address."
  [symb value :nillable]
  (checkp-with u/is-email? symb value "Not a valid email address."))

(defannotation ComplexPassword
  "Check that a password is complex enough."
  [symb value]
  (checkp-with password/is-complex? symb value "Insufficient password strength"))

;;; ### defendpoint

(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via `Integer/parseInt`
   -  converts ROUTE from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`
   -  sequentially applies specified annotation functions on args to validate or cast them.
   -  executes BODY inside a `try-catch` block that handles `ApiExceptions`
   -  automatically calls `wrap-response-if-needed` on the result of BODY
   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below)
      will automatically include the function in the generated `defroutes` form."
  {:arglists '([method route args annotations-map? & body])}
  [method route args & more]
  {:pre [(or (string? route)
             (vector? route))
         (vector? args)]}
  (let [name (route-fn-name method route)
        route (typify-route route)
        [arg-annotations body] (u/optional #(and (map? %) (every? symbol? (keys %))) more)]
    `(do (def ~name
           (~method ~route ~args
                    (catch-api-exceptions
                      (auto-parse ~args
                        (let-annotated-args ~arg-annotations
                                            (-> (do ~@body)
                                                wrap-response-if-needed))))))
         (alter-meta! #'~name assoc :is-endpoint? true))))

(defmacro define-routes
  "Create a `(defroutes routes ...)` form that automatically includes all functions created with
   `defendpoint` in the current namespace."
  [& additional-routes]
  (let [api-routes (->> (ns-publics *ns*)
                        (filter-vals #(:is-endpoint? (meta %)))
                        (map first))]
    `(defroutes ~'routes ~@api-routes ~@additional-routes)))


;; ## NEW PERMISSIONS CHECKING MACROS
;; Since checking `@can_read`/`@can_write` is such a common pattern, these
;; macros eliminate a bit of the redundancy around doing so.
;; They support two forms:
;;
;;     (read-check my-table) ; checks @(:can_read my-table)
;;     (read-check Table 1)  ; checks @(:can_read (sel :one Table :id 1))
;;
;; *  The first form is useful when you've already fetched an object (especially in threading forms such as `->404`).
;; *  The second form takes care of fetching the object for you and is useful in cases where you won't need the object afterward
;;    or want to combine the `sel` and permissions check statements into a single form.
;;
;; Both forms will throw a 404 if the object doesn't exist (saving you one more check!) and return the selected object.

(defmacro read-check
  "Checks that `@can_read` is true for this object."
  ([obj]
   `(let-404 [{:keys [~'can_read] :as obj#} ~obj]
      (check-403 @~'can_read)
      obj#))
  ([entity id]
   (if (= (name entity) "Org")
     `(check-403 (current-user-perms-for-org ~id)) ; current-user-perms-for-org is faster, optimize this common usage
     `(read-check (sel :one ~entity :id ~id)))))

(defmacro write-check
  "Checks that `@can_write` is true for this object."
  ([obj]
   `(let-404 [{:keys [~'can_write] :as obj#} ~obj]
      (check-403 @~'can_write)
      obj#))
  ([entity id]
   (if (= (name entity) "Org")
     `(check-403 (= (current-user-perms-for-org ~id) :admin))
     `(write-check (sel :one ~entity :id ~id)))))
