(ns metabase.api.common
  "Dynamic variables and utility functions/macros for writing API functions.")

(def ^:dynamic *current-user-id*
  "Int ID or nil of user associated with current API call."
  nil)

(def ^:dynamic *current-user*
  "Memoized fn that returns user (or nil) associated with the current API call."
  (constantly nil)) ; default binding is fn that always returns nil

(defmacro with-or-404
  "Evaluate BODY if TEST is not-nil. Otherwise return a 404."
  [test & body]
  `(if-not ~test
     {:status 404
      :body "Not found."} ; TODO - let this message be customizable ?
     (do ~@body)))
