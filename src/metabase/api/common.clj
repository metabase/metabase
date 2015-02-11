(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [compojure.core :refer [defroutes]]
            [medley.core :refer :all]))
            metabase.api.exception

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Memoized fn that returns user (or nil) associated with the current API call."
  (constantly nil)) ; default binding is fn that always returns nil

(defmacro org-perms-case
  "Evaluates BODY inside a case statement based on `*current-user*`'s perms for Org with ORG-ID."
  [org-id & body]
  `(case ((:perms-for-org (*current-user*)) ~org-id)
     ~@body))

(defn api-throw
  "Throw an APIException, with STATUS code and MESSAGE.
   This exception is automatically caught in the body of `defendpoint` functions, and the appropriate HTTP response is generated."
  [status ^String message]
  (throw ^metabase.api.exception.APIException (metabase.api.exception.APIException. ^Integer (int status) message)))


;;; CONDITIONAL RESPONSE MACROS

;; These all work exactly like the corresponding Clojure versions but take an additional arg at the beginning called RESPONSE-PAIR.
;; RESPONSE-PAIR is of the form `[status-code message]`.
;; ex.
;; `(when condition ...) -> (api-when [500 \"Not OK!\"] condition ...)`"

(defmacro api-when
  "Evaluate BODY if TEST is truthy. Otherwise return response with status CODE and MESSAGE.

   `(api-when [501 \"Not allowed!\"] @(:can_write card)
      ...)`"
  [[code message] test & body]
  `(do (when-not ~test (api-throw ~code ~message))
       ~@body))

(defmacro api-let
  "If TEST is true, bind it to BINDING and evaluate BODY.

  `(api-let [404 \"Not found.\"] [user (*current-user*)]
     (:id user))`"
  [response-pair [binding test] & body]
  `(let [~binding ~test]
     (api-when ~response-pair ~binding
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

;; 404 versions are basically the same as versions above but with RESPONSE-PAIR already bound
;; TODO - should rename these to be consistent with the `api-` versions.
(def r404 [404 "Not found."])
(defmacro with-or-404 [& args] `(api-when ~r404 ~@args))
(defmacro let-or-404  [& args] `(api-let  ~r404 ~@args))
(defmacro or-404->    [& args] `(api->    ~r404 ~@args))
(defmacro or-404->>   [& args] `(api->>   ~r404 ~@args))


;;; DEFENDPOINT AND RELATED FUNCTIONS

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
                          (do (try ~@body
                                   (catch metabase.api.exception.APIException e#
                                     {:status (.getStatusCode e#)
                                      :body (.getMessage e#)}))))
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
