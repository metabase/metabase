(ns metabase-enterprise.data-complexity-score.init
  "Loader + startup wiring for data-complexity-score tasks.
  Ensures boot-time Data Complexity Score publishing runs regardless of `MB_DISABLE_SCHEDULER`."
  (:require
   [metabase-enterprise.data-complexity-score.settings]
   [metabase-enterprise.data-complexity-score.task.complexity-score :as task.complexity-score]
   [metabase-enterprise.data-complexity-score.task.complexity-score-trimmer]
   [metabase.startup.core :as startup]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::EmitComplexityScoreIfStale [_]
  ;; Background thread — keeps boot latency flat even when scoring is slow.
  (quick-task/submit-task! task.complexity-score/maybe-emit-boot-score!))
