(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [compojure.core :refer [defroutes]]
            [medley.core :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.db :refer :all])
  (:import com.metabase.corvus.api.ApiException))

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
             *current-user* (delay ((sel-fn :one "metabase.models.user/User" :id ~user-id))) ]
     ~@body))

(defmacro org-perms-case
  "Evaluates BODY inside a case statement based on `*current-user*`'s perms for Org with ORG-ID.
   Case will be `nil`, `:default`, or `:admin`."
  [org-id & body]
  `(let [org-id# ~org-id]                                ; make sure org-id gets evaluated before get to `case`
     (case (when *current-user-id*
             (when-let [{:keys [~'admin]} (sel :one ["metabase.models.org-perm/OrgPerm" :admin] :user_id *current-user-id* :organization_id org-id#)]
               (if ~'admin :admin :default)))
       ~@body)))


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

(defmacro require-params
  "Checks that a list of params are non-nil or throws a 400."
  [& params]
  `(do
     ~@(map (fn [param]
              `(check ~param [400 ~(str "'" (name param) "' is a required param.")]))
            params)))

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

(defmacro defendpoint
  "Define an API function.
   This automatically does several things:

   -  calls `auto-parse` to automatically parse certain args. e.g. `id` is converted from `String` to `Integer` via `Integer/parseInt`
   -  converts ROUTE from a simple form like `\"/:id\"` to a typed one like `[\"/:id\" :id #\"[0-9]+\"]`
   -  executes BODY inside a `try-catch` block that handles `ApiExceptions`
   -  automatically calls `wrap-response-if-needed` on the result of BODY
   -  tags function's metadata in a way that subsequent calls to `define-routes` (see below)
      will automatically include the function in the generated `defroutes` form."
  [method route args & body]
  {:pre [(or (string? route)
             (vector? route))
         (vector? args)]}
  (let [name (route-fn-name method route)
        route (typify-route route)]
    `(do (def ~name
           (~method ~route ~args
                    (auto-parse ~args
                      (catch-api-exceptions
                        (-> (do ~@body)
                            wrap-response-if-needed)))))
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
   `(read-check (sel :one ~entity :id ~id))))

(defmacro write-check
  "Checks that `@can_write` is true for this object."
  ([obj]
   `(let-404 [{:keys [~'can_write] :as obj#} ~obj]
      (check-403 @~'can_write)
      obj#))
  ([entity id]
   `(write-check (sel :one ~entity :id ~id))))
