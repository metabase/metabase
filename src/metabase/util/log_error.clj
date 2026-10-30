(ns metabase.util.log-error
  "Which parts of an exception's `ex-data` go to the error log line, as log context.

  Ex-data is server-side context, and most of it (queries, values, metadata) is too large or too sensitive to log. So
  each key that is useful for debugging is opted in, the same way client-facing keys are opted in for API responses
  with `:response/keys` (see [[metabase.util.api-error]]). The two lists are independent: a key can be logged, sent,
  both, or neither.

  ## Logging keys

  List them under `:log/keys`, as a literal set where the ex-data is built:

    (throw (ex-info (tru \"Field is not available\")
                    {:status-code 400, :field-id id, :field-name field-name, :log/keys #{:field-id :field-name}}))

  logs `field-id` and `field-name` alongside the message. List ids and names that help find the cause, never a query
  or values from it. A listed key that is absent is skipped.

  ## Reading them

  An error handler that logs an exception passes [[log-data]] to `metabase.util.log/with-thread-context`."
  (:require
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn log-data
  "The ex-data entries that each exception in `e`'s chain lists under `:log/keys`, for the error log line. An inner
  exception's entries win over an outer one's. Empty when a `:log/keys` is malformed, so that it can't mask `e`."
  [^Throwable e]
  (try
    (into {}
          (map (fn [ex]
                 (let [data (ex-data ex)]
                   (select-keys data (:log/keys data)))))
          (u/full-exception-chain e))
    (catch Throwable _
      {})))
