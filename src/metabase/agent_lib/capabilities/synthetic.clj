(ns metabase.agent-lib.capabilities.synthetic
  "Synthetic structured helper symbols that are accepted by agent-lib but are
  not modeled as normal capability entries.")

(set! *warn-on-reflection* true)

(def ^{:doc "Synthetic helper symbols accepted by the structured evaluator."}
  synthetic-helper-symbols
  '#{query})
