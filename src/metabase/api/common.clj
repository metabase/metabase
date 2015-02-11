(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions."
  (:require [compojure.core :refer [defroutes]]
            [medley.core :refer :all]))

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Memoized fn that returns user (or nil) associated with the current API call."
  (constantly nil)) ; default binding is fn that always returns nil

(defmacro with-or-404
  "Evaluate BODY if TEST is not-nil. Otherwise return a 404.
(defmacro org-perms-case
  "Evaluates BODY inside a case statement based on `*current-user*`'s perms for Org with ORG-ID."
  [org-id & body]
  `(case ((:perms-for-org (*current-user*)) ~org-id)
     ~@body))


   `(with-or-404 (*current-user*)
      ...)`"
  [test & body]
  `(if-not ~test
     {:status 404
      :body "Not found."} ; TODO - let this message be customizable ?
     (do ~@body)))

(defmacro let-or-404
  "If TEST is true, bind it to BINDING and evaluate BODY. Otherwise return a 404.

  `(let-or-404 [user (*current-user*)]
     (:id user))`"
  [[binding test] & body]
  `(let [~binding ~test]
     (with-or-404 ~binding
       ~@body)))

(defmacro or-404->
  "If TEST is true, thread the result using `->` through BODY.

  `(or-404-> (*current-user*)
     :id)`"
  [test & body]
  `(let-or-404 [result# ~test]
     (-> result#
         ~@body)))

(defmacro or-404->>
  "Like `or-404->`, but threads result using `->>`."
  [test & body]
  `(let-or-404 [result# ~test]
     (->> result#
          ~@body)))

(defn wrap-response-if-needed
  "If RESPONSE isn't already a map with keys :status and :body, wrap it in one (using status 200)."
  [response]
  (letfn [(is-wrapped? [resp] (and (map? resp)
                                   (:status resp)
                                   (:body resp)))]
    (if (is-wrapped? response) response
        {:status 200
         :body response})))


(defn route-fn-name
  "Generate a symbol suitable for use as the name of an API endpoint fn.
   Name is just METHOD + ROUTE with slashes replaced by underscores.
   `(route-fn-name GET \"/:id\") -> GET_:id`"
  [method route]
  (-> (str (name method) route)
      (^String .replace "/" "_")
      symbol))

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
                    (-> (auto-parse ~args ~@body)
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
