(ns metabase-enterprise.semantic-layer.init
  "Loader + startup wiring for semantic-layer tasks. Required from `metabase-enterprise.core.init`
  so `task/init!` methods are discoverable when the scheduler boots, and so the boot-time Data
  Complexity Score emission runs regardless of scheduler state (e.g. when
  `MB_DISABLE_SCHEDULER=true`)."
  (:require
   [metabase-enterprise.semantic-layer.settings]
   [metabase-enterprise.semantic-layer.task.complexity-score :as task.complexity-score]
   [metabase.startup.core :as startup]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::EmitComplexityScoreIfStale [_]
  ;; Background thread — keeps boot latency flat even when scoring is slow. Cluster-safety and
  ;; fingerprint gating live in `task.complexity-score/maybe-emit-boot-score!`.
  (quick-task/submit-task! task.complexity-score/maybe-emit-boot-score!))
