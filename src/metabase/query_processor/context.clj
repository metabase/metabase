(ns metabase.query-processor.context
  (:require [metabase.async.util :as async.u]))

(defn raisef
  "Raise an Exception."
  {:arglists '([e context])}
  [e {:keys [raisef], :as context}]
  {:pre [(fn? raisef)]}
  (raisef e context))

;; Normal flow is something like

;; [middleware] -> preprocessedf -> nativef -> runf -> executef -> metadataf -> reducef -> reducedf -|
;                                                                                                   -+-> resultf -> out-chan
;;          raisef ----------------------------------------------------------------------------------|
;;            |
;; cancelf ->-+
;;
(defn runf
  "Called by pivot fn to run preprocessed query. Normally, this simply calls `executef`, but you can override this for
  test purposes."
  {:arglists '([query xformf context])}
  [query xformf {:keys [runf], :as context}]
  {:pre [(fn? runf)]}
  (runf query xformf context))

(defn executef
  "Called by `runf` to have driver run query. By default, `driver/execute-reducible-query`. `respond` is a callback with
  the signature:

    (respond results-metadata reducible-rows)

  The implementation of `executef` should call `respond` with this information once it is available."
  {:arglists '([driver query context respond])}
  [driver query {:keys [executef], :as context} respond]
  {:pre [(ifn? executef)]}
  (executef driver query context respond))

(defn reducef
  "Called by `runf` (inside the `respond` callback provided by it) to reduce results of query. `reducedf` is called with
  the reduced resullts."
  {:arglists '([xformf context metadata reducible-rows])}
  [xformf {:keys [reducef], :as context} metadata reducible-rows]
  {:pre [(fn? reducef)]}
  (reducef xformf context metadata reducible-rows))

(defn reducedf
  "Called in `reducedf` with fully reduced results. This result is passed to `resultf`."
  {:arglists '([metadata reduced-rows context])}
  [metadata reduced-rows {:keys [reducedf], :as context}]
  {:pre [(fn? reducedf)]}
  (reducedf metadata reduced-rows context))

(defn metadataf
  "Called upon receiving metadata from driver."
  {:arglists '([metadata context])}
  [metadata {:keys [metadataf], :as context}]
  {:pre [(fn? metadataf)], :post [(map? %)]}
  (metadataf metadata context))

(defn preprocessedf
  "Called when query is fully preprocessed."
  {:arglsts '([query context])}
  [query {:keys [preprocessedf], :as context}]
  {:pre [(fn? preprocessedf)]}
  (preprocessedf query context))

(defn nativef
  "Called when query is convert to native."
  {:arglists '([query context])}
  [query {:keys [nativef], :as context}]
  {:pre [(fn? nativef)]}
  (nativef query context))

(defn timeoutf
  "Call this function when a query times out."
  {:arglists '([context])}
  [{:keys [timeoutf], :as context}]
  {:pre [(fn? timeoutf)]}
  (timeoutf context))

(defn cancelf
  "Call this function to cancel a query."
  {:arglists '([context])}
  [{:keys [cancelf], :as context}]
  {:pre [(fn? cancelf)]}
  (cancelf context))

(defn resultf
  "ALWAYS alled exactly once with the final result, which is the result of either `reducedf` or `raisef`."
  {:arglists '([result context])}
  [result {:keys [resultf], :as context}]
  {:pre [(fn? resultf)]}
  (resultf result context))

(defn timeout
  "Maximum amount of time query is allowed to run, in ms."
  {:arglists '([context])}
  [{:keys [timeout]}]
  {:pre [(int? timeout)]}
  timeout)

(defn base-xformf
  "xformf passed to the first middleware.

    (xformf metadata) -> xform"
  {:arglists '([context])}
  [{:keys [base-xformf]}]
  {:pre [(fn? base-xformf)]}
  base-xformf)

(defn rff
  "Reducing function.

    (rff metadata) -> rf"
  {:arglists '([context])}
  [{:keys [rff]}]
  {:pre [(fn? rff)]}
  rff)

(defn canceled-chan
  "Gets a message if query is canceled."
  {:arglists '([context])}
  [{:keys [canceled-chan]}]
  {:pre [(async.u/promise-chan? canceled-chan)]}
  canceled-chan)

(defn out-chan
  "Gets a message with the final result."
  {:arglists '([context])}
  [{:keys [out-chan]}]
  {:pre [(async.u/promise-chan? out-chan)]}
  out-chan)
