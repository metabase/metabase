(ns dev.dbt-import.unsupported
  "How the converter says what it cannot convert. A metric or a construct the converter has no Metabase equivalent
  for is not an error: it is reported, with a reason, and the run goes on.

  Deep in a stage, where there is no report to add to, the reason is thrown with [[throw!]]; the stage catches it
  where it knows which metric it is about (see [[catching]] and [[with-reason-prefix]]) and turns it into a
  [[report]] entry, or, for a dimension, into an `unsupported-dimension` of the metric. Any other exception is a bug
  or an input the converter did not anticipate, and is left alone here; the resolve stage lists it under `:errors`."
  (:require
   [dev.dbt-import.schemas.ir :as ir]
   [dev.dbt-import.schemas.resolved :as resolved]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (clojure.lang ExceptionInfo)))

(mr/def ::result
  "Whatever a stage makes of a construct: the thunks [[catching]] and [[with-reason-prefix]] run return Lib clauses,
  vectors of them, dimension results and more, so this is deliberately open."
  [:any {::mr/deliberately-open true}])

(mu/defn throw! :- :nil
  "Throw the exception that says the converter cannot express something. `reason` is the message, run through `format`
  with `args` when there are any; without them it is taken as it is, so a reason already formatted can carry a `%`."
  [reason :- :string
   & args :- [:* [:or :string number? :keyword :nil]]]
  (throw (ex-info (if (seq args) (apply format reason args) reason) {::unsupported true})))

(mu/defn exception? :- :boolean
  "Was `e` thrown by [[throw!]]?"
  [e :- (ms/InstanceOfClass Throwable)]
  (boolean (and (instance? ExceptionInfo e) (::unsupported (ex-data e)))))

(mu/defn catching :- ::result
  "Run `thunk`. When it throws an unsupported reason (see [[throw!]]), return `(on-unsupported reason)` instead; any
  other exception propagates."
  [thunk          :- ifn?
   on-unsupported :- ifn?]
  (try
    (thunk)
    (catch ExceptionInfo e
      (if (exception? e)
        (on-unsupported (ex-message e))
        (throw e)))))

(mu/defn with-reason-prefix :- ::result
  "Run `thunk`; an unsupported reason it throws is rethrown with `prefix` in front, `\"<prefix>: <reason>\"`, so the
  reason says which part of the metric it is about."
  [prefix :- :string
   thunk  :- ifn?]
  (catching thunk (fn [reason] (throw! "%s: %s" prefix reason))))

(mu/defn report :- ::ir/unsupported
  "The report entry for a metric that could not be converted: its name and unique id, and why."
  [metric-name :- :string
   unique-id   :- :string
   reason      :- :string]
  {:name      metric-name
   :unique-id unique-id
   :reason    reason})

(mu/defn report? :- :boolean
  "Is `result`, what a stage made of a metric or a semantic model, a [[report]] entry rather than a parsed or converted
  metric, a parsed semantic model or an error?"
  [result :- [:or ::ir/unsupported ::ir/metric ::ir/semantic-model ::resolved/metric ::resolved/error]]
  (contains? result :reason))
