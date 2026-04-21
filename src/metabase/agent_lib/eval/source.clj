(ns metabase.agent-lib.eval.source
  "Structured source resolution for program evaluation."
  (:require
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.runtime :as runtime]))

(set! *warn-on-reflection* true)

(defn resolve-source
  "Resolve a structured program source into metadata or a query."
  [evaluate-program runtime source-path source]
  (case (:type source)
    "context"
    (or (get (runtime/bindings-map runtime) 'source)
        (invalid-program! source-path "context source is unavailable in runtime bindings"))

    "table"
    ((runtime/helper-fn runtime 'table) (:id source))

    ("card" "dataset")
    ((runtime/helper-fn runtime 'card) (:id source))

    "metric"
    ((runtime/helper-fn runtime 'metric) (:id source))

    "program"
    (evaluate-program (conj source-path :program) (:program source))

    (invalid-program! (conj source-path :type) "unsupported source type")))
