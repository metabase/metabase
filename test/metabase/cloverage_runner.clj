(ns metabase.cloverage-runner
  (:require
   [cloverage.coverage]))

(defn run-project
  "Shim for running tests using Cloverage to get code coverage metrics. See comments in `deps.edn` for more
  information."
  [options]
  ;; parse regex lists into actual regex Patterns since regex literals aren't allowed in EDN.
  (let [options (reduce
                 (fn [options k]
                   (cond-> options
                     (seq (k options)) (update k (partial map re-pattern))))
                 options
                 [:ns-regex :ns-exclude-regex])]
    (cloverage.coverage/run-project options)))
