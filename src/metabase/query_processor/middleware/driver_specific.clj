(ns metabase.query-processor.middleware.driver-specific
  "Middleware that hands off to a driver's implementation of `process-query-in-context`, if any.
   If implemented, this effectively lets one inject custom driver-specific middleware for the QP.
   Drivers can use it to different things like rewrite queries as needed or perform special permissions checks."
  (:require [metabase.driver :as driver]))

(defn process-query-in-context
  "Middleware that runs the query using the driver's `process-query-in-context` implementation, if any.
   (Implementing this method effectively allows drivers to inject their own QP middleware functions.)"
  [qp]
  (fn [{driver :driver, :as query}]
    ((driver/process-query-in-context driver qp) query)))
