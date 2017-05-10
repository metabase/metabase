(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [compojure.core :refer [defroutes]]
            [medley.core :as m]
            [metabase
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.common.internal :refer :all]
            [metabase.models.interface :as mi]
            [toucan.db :as db]))

(declare check-403 check-404)

;;; ------------------------------------------------------------ DYNAMIC VARIABLES ------------------------------------------------------------
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


;;; ------------------------------------------------------------ Precondition checking helper fns  ------------------------------------------------------------

(defn check
  "Assertion mechanism for use inside API functions.
   Checks that TEST is true, or throws an `ExceptionInfo` with STATUS-CODE and MESSAGE.

   MESSAGE can be either a plain string error message, or a map including the key `:message` and any additional details, such as an `:error_code`.

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
       (throw (if (map? message)
                (ex-info (:message message) (assoc message :status-code code))
                (ex-info message            {:status-code code}))))
     (if (empty? rest-args) tst
         (recur (first rest-args) (second rest-args) (drop 2 rest-args))))))

(defn check-exists?
  "Check that object with ID (or other key/values) exists in the DB, or throw a 404."
  ([entity id]
   (check-exists? entity :id id))
  ([entity k v & more]
   (check-404 (apply db/exists? entity k v more))))

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


;;; ------------------------------------------------------------ api-let, api->, etc. ------------------------------------------------------------

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

(def ^:const generic-204-no-content
  "A 'No Content' response for `DELETE` endpoints to return."
  {:status 204, :body nil})


;;; ------------------------------------------------------------ DEFENDPOINT AND RELATED FUNCTIONS ------------------------------------------------------------

;; TODO - several of the things `defendpoint` does could and should just be done by custom Ring middleware instead
(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via `Integer/parseInt`
   -  converts ROUTE from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`
   -  sequentially applies specified annotation functions on args to validate them.
   -  executes BODY inside a `try-catch` block that handles exceptions; if exception is an instance of `ExceptionInfo` and includes a `:status-code`,
      that code will be returned
   -  automatically calls `wrap-response-if-needed` on the result of BODY
   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below)
      will automatically include the function in the generated `defroutes` form.
   -  Generates a super-sophisticated Markdown-formatted docstring"
  {:arglists '([method route docstr? args schemas-map? & body])}
  [method route & more]
  {:pre [(or (string? route)
             (vector? route))]}
  (let [fn-name                (route-fn-name method route)
        route                  (typify-route route)
        [docstr [args & more]] (u/optional string? more)
        [arg->schema body]     (u/optional #(and (map? %) (every? symbol? (keys %))) more)
        validate-param-calls   (validate-params arg->schema)]
    (when-not docstr
      (log/warn (format "Warning: endpoint %s/%s does not have a docstring." (ns-name *ns*) fn-name)))
    `(def ~(vary-meta fn-name assoc
                      ;; eval the vals in arg->schema to make sure the actual schemas are resolved so we can document their API error messages
                      :doc (route-dox method route docstr args (m/map-vals eval arg->schema) body)
                      :is-endpoint? true)
       (~method ~route ~args
        (catch-api-exceptions
          (auto-parse ~args
            ~@validate-param-calls
            (wrap-response-if-needed (do ~@body))))))))


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


;;; ------------------------------------------------------------ PERMISSIONS CHECKING HELPER FNS ------------------------------------------------------------

(defn read-check
  "Check whether we can read an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (check-403 (mi/can-read? obj))
   obj)
  ([entity id]
   (read-check (entity id)))
  ([entity id & other-conditions]
   (read-check (apply db/select-one entity :id id other-conditions))))

(defn write-check
  "Check whether we can write an existing OBJ, or ENTITY with ID.
   If the object doesn't exist, throw a 404; if we don't have proper permissions, throw a 403.
   This will fetch the object if it was not already fetched, and returns OBJ if the check is successful."
  {:style/indent 2}
  ([obj]
   (check-404 obj)
   (check-403 (mi/can-write? obj))
   obj)
  ([entity id]
   (write-check (entity id)))
  ([entity id & other-conditions]
   (write-check (apply db/select-one entity :id id other-conditions))))


;;; ------------------------------------------------------------ OTHER HELPER FNS ------------------------------------------------------------

(defn check-public-sharing-enabled
  "Check that the `public-sharing-enabled` Setting is `true`, or throw a `400`."
  []
  (check (public-settings/enable-public-sharing)
    [400 "Public sharing is not enabled."]))

(defn check-embedding-enabled
  "Is embedding of Cards or Objects (secured access via `/api/embed` endpoints with a signed JWT enabled?"
  []
  (check (public-settings/enable-embedding)
    [400 "Embedding is not enabled."]))

(defn check-not-archived
  "Check that the OBJECT exists and is not `:archived`, or throw a `404`. Returns OBJECT as-is if check passes."
  [object]
  (u/prog1 object
    (check-404 object)
    (check (not (:archived object))
      [404 {:message "The object has been archived.", :error_code "archived"}])))
