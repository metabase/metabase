(ns metabase.api.util
  "Utility functions and macros for writing API functions.")

(defmacro with-or-404
  "Evaluate BODY if TEST is not-nil. Otherwise return a 404."
  [test & body]
  `(if-not ~test
     {:status 404
      :body "Not found."} ; TODO - let this message be customizable ?
     (do ~@body)))
