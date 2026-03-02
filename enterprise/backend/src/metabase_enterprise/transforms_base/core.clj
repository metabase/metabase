(ns metabase-enterprise.transforms-base.core
  "Entry point for base transform execution (enterprise edition)."
  (:require
   [metabase-enterprise.transforms-base.interface :as transforms-base.i]
   ;; Load query implementation - registers multimethods
   [metabase-enterprise.transforms-base.query]))

(defn execute!
  "Execute transform and return result map without writing transform_run rows."
  ([transform]
   (execute! transform nil))
  ([transform opts]
   (transforms-base.i/execute-base! transform opts)))
