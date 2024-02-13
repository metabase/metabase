(ns ^{:deprecated "0.50.0"} metabase.query-processor.context
  (:require [metabase.query-processor.pipeline :as qp.pipeline]))

(defn canceled-chan
  "DEPRECATED: use [[metabase.query-processor.pipeline/*canceled-chan*]] directly instead."
  {:deprecated "0.50.0"}
  [_context]
  qp.pipeline/*canceled-chan*)

(defn timeout
  "DEPRECATED: use [[metabase.query-processor.pipeline/*query-timeout-ms*]] directly instead."
  [_context]
  {:deprecated "0.50.0"}
  qp.pipeline/*query-timeout-ms*)
