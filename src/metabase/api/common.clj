(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [compojure.core :refer [defroutes]]
            [medley.core :refer :all]
            [metabase.api.common.internal :refer :all]
            [metabase.db :refer [sel-fn]])
  (:import com.metabase.corvus.api.APIException))


;;; DYNAMICALLY BOUND REQUEST VARIABLES
;; These get bound by middleware for each HTTP request.

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

;; TODO - This would probably be slightly nicer if we rewrote it as a delay
(def ^:dynamic *current-user*
  "Memoized fn that returns user (or nil) associated with the current API call."
  (constantly nil)) ; default binding is fn that always returns nil

(defmacro with-current-user
  "Primarily for debugging purposes. Evaulates BODY as if *current-user* was the User with USER-ID."
  [user-id & body]
  `(binding [*current-user-id* ~user-id
             *current-user* (sel-fn :one "metabase.models.user/User" :id ~user-id)]
     ~@body))

(defmacro org-perms-case
  "Evaluates BODY inside a case statement based on `*current-user*`'s perms for Org with ORG-ID.
   Case will be `nil`, `:default`, or `:admin`."
  [org-id & body]
  `(case (when (*current-user*)
           ((:perms-for-org (*current-user*)) ~org-id))
     ~@body))


;;; CONDITIONAL RESPONSE FUNCTIONS / MACROS

(defn check
  "Assertion mechanism for use inside API functions.
   Checks that TEST is true, or throws an `APIException` with STATUS-CODE and MESSAGE.

   This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is generated."
  ([test [status-code ^String message]]
   (when-not test
     (throw (APIException. (int status-code) message))))
  ([test status-code message]                            ; (check TEST [CODE MESSAGE]) or (check TEST CODE MESSAGE)
   (check test [status-code message])))                  ; are both acceptable for the sake of flexibility

;; The following all work exactly like the corresponding Clojure versions
;; but take an additional arg at the beginning called RESPONSE-PAIR.
;; RESPONSE-PAIR is of the form `[status-code message]`.
;; ex.
;; `(let [binding x] ...) -> (api-let [500 \"Not OK!\"] [binding x] ...)`"

(defmacro api-let
  "If TEST is true, bind it to BINDING and evaluate BODY.

  `(api-let [404 \"Not found.\"] [user (*current-user*)]
     (:id user))`"
  [response-pair [binding test] & body]
  `(let [test# ~test] ; bind ~test so doesn't get evaluated more than once (e.g. in case it's an expensive funcall)
     (check test# ~response-pair)
     (let [~binding test#]
       ~@body)))

(defmacro api->
  "If TEST is true, thread the result using `->` through BODY.

  `(api-> [404 \"Not found\"] (*current-user*)
     :id)`"
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


;;; GENERIC RESPONSE HELPERS
;; These are basically the same as the `api-` versions but with RESPONSE-PAIR already bound

;; GENERIC 404 RESPONSE HELPERS
(def generic-404 [404 "Not found."])
(defn     check-404 [test]    (check test generic-404))
(defmacro let-404   [& args] `(api-let   ~generic-404 ~@args))
(defmacro ->404     [& args] `(api->     ~generic-404 ~@args))
(defmacro ->>404    [& args] `(api->>    ~generic-404 ~@args))

;; GENERIC 403 RESPONSE HELPERS
;; If you can't be bothered to write a custom error message
(def generic-403 [403 "You don't have permissions to do that."])
(defn     check-403 [test]    (check test generic-403))
(defmacro let-403   [& args] `(api-let   ~generic-403 ~@args))
(defmacro ->403     [& args] `(api->     ~generic-403 ~@args))
(defmacro ->>403    [& args] `(api->>    ~generic-403 ~@args))

;; GENERIC 500 RESPONSE HELPERS
;; For when you don't feel like writing something useful
(def generic-500 [500 "Internal server error."])
(defn     check-500 [test]    (check test generic-500))
(defmacro let-500   [& args] `(api-let   ~generic-500 ~@args))
(defmacro ->500     [& args] `(api->     ~generic-500 ~@args))
(defmacro ->>500    [& args] `(api->>    ~generic-500 ~@args))


;; DEFENDPOINT AND RELATED FUNCTIONS

(def ^:dynamic *auto-parse-types*
  "Map of symbol -> parse-fn.
   Symbols that should automatically be parsed by given functions when passed as parameters to the API."
  {'id 'Integer/parseInt
   'org 'Integer/parseInt})

(defmacro auto-parse
  "Create a `let` form that applies corresponding parse-fn for any symbols in ARGS that are present in `*auto-parse-types*`."
  [args & body]
  (let [let-forms (->> args
                       (mapcat (fn [arg]
                                 (if (contains? *auto-parse-types* arg) [arg (list (*auto-parse-types* arg) arg)])))
                       (filter identity))]
    `(let [~@let-forms]
       ~@body)))

(defmacro defendpoint
  "Define an API function that implicitly calls wrap-response-if-needed.
   The function's metadata is tagged in a way that subsequent calls to `define-routes` (see below)
   will automatically include the function in the generated `defroutes` form."
  [method route args & body]
  (let [name (route-fn-name method route)]
    `(do (def ~name
           (~method ~route ~args
                    (-> (auto-parse ~args
                          (catch-api-exceptions ~@body))
                        wrap-response-if-needed)))
         (alter-meta! #'~name assoc :is-endpoint? true))))

(defmacro define-routes
  "Create a `(defroutes routes ...)` form that automatically includes all functions created with
   `defendpoint` in the current namespace."
  [& additional-routes]
  (let [api-routes (->> (ns-publics *ns*)
                        (filter-vals #(:is-endpoint? (meta %)))
                        (map first))]
    `(defroutes ~'routes ~@api-routes ~@additional-routes)))
