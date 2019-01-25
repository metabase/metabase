(ns metabase.query-processor.middleware.catch-exceptions-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.catch-exceptions :as catch-exceptions]))

(expect
  {}
  ((catch-exceptions/catch-exceptions identity) {}))

(expect
  {:status     :failed
   :class      java.lang.Exception
   :error      "Something went wrong"
   :stacktrace true
   :query      {}}
  (-> ((catch-exceptions/catch-exceptions (fn [_] (throw (Exception. "Something went wrong")))) {})
      (update :stacktrace boolean)))
