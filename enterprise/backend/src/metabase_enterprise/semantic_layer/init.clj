(ns metabase-enterprise.semantic-layer.init
  "Loader + startup wiring for semantic-layer tasks.
  Ensures boot-time Data Complexity Score publishing runs regardless of `MB_DISABLE_SCHEDULER`."
  (:require
   [metabase-enterprise.semantic-layer.settings]
   [metabase-enterprise.semantic-layer.task.complexity-score :as task.complexity-score]
   [metabase.startup.core :as startup]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::EmitComplexityScoreIfStale [_]
  ;; Background thread — keeps boot latency flat even when scoring is slow.
  (quick-task/submit-task! task.complexity-score/maybe-emit-boot-score!))
