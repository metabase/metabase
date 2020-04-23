(ns metabase.query-processor.context
  "Interface for the QP context/utility functions for using the things in the context correctly.

  The default implementations of all these functions live in `metabase.query-processor.context.default`; refer to
  those when overriding individual functions. Some wiring for the `core.async` channels takes place in
  `metabase.query-processor.reducible.`"
  (:require [metabase.async.util :as async.u]))

(defn raisef
  "Raise an Exception."
  {:arglists '([e context])}
  [e {raisef* :raisef, :as context}]
  {:pre [(fn? raisef*)]}
  (raisef* e context))

;; Normal flow is something like:
;;
;;    [middleware] → preprocessedf → nativef → runf → executef → reducef → reducedf -\
;;        ↓                                                                           ↦ resultf → out-chan
;;    [Exception]  → raisef ---------------------------------------------------------/               ↑
;;        ↑                                                                                          |
;;     timeoutf                                                                                      |
;;        ↑                                                                                          |
;;    [time out]              [out-chan closed early]                                                |
;;                                      ↓                                                   [closes] |
;;                                 canceled-chan ----------------------------------------------------/
;;                                      ↑
;;                       [message sent to canceled chan]
;;
;; 1. Query normally runs thru middleware and then a series of context functions as described above; result is sent thru
;;    `resultf` and finally to `out-chan`
;;
;; 2. If an `Exception` is thrown, it is sent thru `raisef`, `resultf` and finally to `out-chan`
;;
;; 3. If the query times out, `timeoutf` throws an Exception
;;
;; 4. If the query is canceled (either by closing `out-chan` before it gets a result, or by sending `canceled-chan` a
;; message), the execution is canceled and `out-chan` is closed (if not already closed).
(defn runf
  "Called by pivot fn to run preprocessed query. Normally, this simply calls `executef`, but you can override this for
  test purposes. The result of this function is ignored."
  {:arglists '([query rff context])}
  [query rff {runf* :runf, :as context}]
  {:pre [(fn? runf*)]}
  (runf* query rff context)
  nil)

(defn executef
  "Called by `runf` to have driver run query. By default, `driver/execute-reducible-query`. `respond` is a callback with
  the signature:

    (respond results-metadata reducible-rows)

  The implementation of `executef` should call `respond` with this information once it is available. The result of
  this function is ignored."
  {:arglists '([driver query context respond])}
  [driver query {executef* :executef, :as context} respond]
  {:pre [(ifn? executef*)]}
  (executef* driver query context respond)
  nil)

(defn reducef
  "Called by `runf` (inside the `respond` callback provided by it) to reduce results of query. `reducedf` is called with
  the reduced results. The actual output of this function is ignored, but the entire result set must be reduced and
  passed to `reducedf` before this function completes."
  {:arglists '([rff context metadata reducible-rows])}
  [rff {reducef* :reducef, :as context} metadata reducible-rows]
  {:pre [(fn? reducef*)]}
  (reducef* rff context metadata reducible-rows)
  nil)

(defn reducedf
  "Called in `reducedf` with fully reduced results. This result is passed to `resultf`."
  {:arglists '([metadata reduced-rows context])}
  [metadata reduced-rows {reducedf* :reducedf, :as context}]
  {:pre [(fn? reducedf*)]}
  (reducedf* metadata reduced-rows context))

(defn preprocessedf
  "Called when query is fully preprocessed."
  {:arglsts '([query context])}
  [query {preprocessedf* :preprocessedf, :as context}]
  {:pre [(fn? preprocessedf*)], :post [(map? %)]}
  (preprocessedf* query context))

(defn nativef
  "Called when query is convert to native."
  {:arglists '([query context])}
  [query {nativef* :nativef, :as context}]
  {:pre [(fn? nativef*)]}
  (nativef* query context))

(defn timeoutf
  "Call this function when a query times out."
  {:arglists '([context])}
  [{timeoutf* :timeoutf, :as context}]
  {:pre [(fn? timeoutf*)]}
  (timeoutf* context))

(defn resultf
  "Called exactly once with the final result, which is the result of either `reducedf` or `raisef`."
  {:arglists '([result context])}
  [result {resultf* :resultf, :as context}]
  {:pre [(fn? resultf*)]}
  (resultf* result context))

(defn timeout
  "Maximum amount of time query is allowed to run, in ms."
  {:arglists '([context])}
  [{timeout* :timeout}]
  {:pre [(int? timeout*)]}
  timeout*)

(defn rff
  "Reducing function.

    (rff metadata) -> rf"
  {:arglists '([context])}
  [{rff* :rff}]
  {:pre [(fn? rff*)]}
  rff*)

(defn canceled-chan
  "Gets a message if query is canceled."
  {:arglists '([context])}
  [{canceled-chan* :canceled-chan}]
  {:pre [(async.u/promise-chan? canceled-chan*)]}
  canceled-chan*)

(defn out-chan
  "Gets a message with the final result."
  {:arglists '([context])}
  [{out-chan* :out-chan}]
  {:pre [(async.u/promise-chan? out-chan*)]}
  out-chan*)
