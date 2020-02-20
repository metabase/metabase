(ns metabase.query-processor.context
  (:require [metabase.async.util :as async.u]))

(defn raisef
  "Raise an Exception."
  {:arglists '([e context])}
  [e {raisef* :raisef, :as context}]
  {:pre [(fn? raisef*)]}
  (raisef* e context))

;; Normal flow is something like

;; [middleware] -> preprocessedf -> nativef -> runf -> executef -> metadataf -> reducef -> reducedf -|
;                                                                                                   -+-> resultf -> out-chan
;;          raisef ----------------------------------------------------------------------------------|
;;            |
;; cancelf ->-+
;;
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

(defn metadataf
  "Called upon receiving metadata from driver."
  {:arglists '([metadata context])}
  [metadata {metadataf* :metadataf, :as context}]
  {:pre [(fn? metadataf*)], :post [(map? %)]}
  (metadataf* metadata context))

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

(defn cancelf
  "Call this function to cancel a query."
  {:arglists '([context])}
  [{cancelf* :cancelf, :as context}]
  {:pre [(fn? cancelf*)]}
  (cancelf* context))

(defn resultf
  "ALWAYS alled exactly once with the final result, which is the result of either `reducedf` or `raisef`."
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
