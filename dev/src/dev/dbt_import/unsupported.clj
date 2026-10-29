(ns dev.dbt-import.unsupported
  "How the converter says what it cannot convert. A metric or a construct the converter has no Metabase equivalent
  for is not an error: it is reported, with a reason, and the run goes on.

  Deep in a stage, where there is no report to add to, the reason is thrown with [[throw!]]; the stage catches it
  where it knows which metric it is about (see [[catching]] and [[with-reason-prefix]]) and turns it into a
  [[report]] entry, or, for a dimension, into an `unsupported-dimension` of the metric. Any other exception is a bug
  or an input the converter did not anticipate, and is left alone."
  (:require
   [dev.dbt-import.schemas.ir :as ir]
   [metabase.util.malli :as mu])
  (:import
   (clojure.lang ExceptionInfo)))

(defn throw!
  "Throw the exception that says the converter cannot express something. `reason` is the message, run through `format`
  with `args` when there are any; without them it is taken as it is, so a reason already formatted can carry a `%`."
  [reason & args]
  (throw (ex-info (if (seq args) (apply format reason args) reason) {::unsupported true})))

(defn exception?
  "Was `e` thrown by [[throw!]]?"
  [e]
  (boolean (and (instance? ExceptionInfo e) (::unsupported (ex-data e)))))

(defn catching
  "Run `thunk`. When it throws an unsupported reason (see [[throw!]]), return `(on-unsupported reason)` instead; any
  other exception propagates."
  [thunk on-unsupported]
  (try
    (thunk)
    (catch ExceptionInfo e
      (if (exception? e)
        (on-unsupported (ex-message e))
        (throw e)))))

(defn with-reason-prefix
  "Run `thunk`; an unsupported reason it throws is rethrown with `prefix` in front, `\"<prefix>: <reason>\"`, so the
  reason says which part of the metric it is about."
  [prefix thunk]
  (catching thunk (fn [reason] (throw! "%s: %s" prefix reason))))

(mu/defn report :- ::ir/unsupported
  "The report entry for a metric that could not be converted: its name and unique id, and why."
  [metric-name :- :string
   unique-id   :- :string
   reason      :- :string]
  {:name      metric-name
   :unique-id unique-id
   :reason    reason})
