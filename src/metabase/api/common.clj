(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions.")

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Memoized fn that returns user (or nil) associated with the current API call."
  (constantly nil)) ; default binding is fn that always returns nil

(defmacro with-or-404
  "Evaluate BODY if TEST is not-nil. Otherwise return a 404.

   `(with-or-404 (*current-user*)
      ...)`"
  [test & body]
  `(if-not ~test
     {:status 404
      :body "Not found."} ; TODO - let this message be customizable ?
     (do ~@body)))

(defmacro let-or-404
  "If TEST is true, bind in to BINDING and evaluate BODY. Otherwise return a 404.

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
  "Like or-404->, but threads result using `->>`."
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

(defmacro defapi
  "Define an API function that implicitly calls wrap-response-if-needed."
  [& forms]
  (let [[forms last-form] [(butlast forms) (last forms)]]
    `(defn ~@forms
       (-> ~last-form
           wrap-response-if-needed))))
