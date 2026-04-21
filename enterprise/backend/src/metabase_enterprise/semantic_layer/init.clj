(ns metabase-enterprise.semantic-layer.init
  "Startup wiring for the semantic-layer module.
  Registers a startup hook that publishes the complexity score for this instance once per boot:
  an :info log via [[metabase-enterprise.semantic-layer.complexity/complexity-scores]] and, when
  anonymous analytics is on, a Snowplow event per (catalog × axis). Runs on a background task so
  startup isn't blocked by the scoring pass, and runs unconditionally so operators have a
  locally-visible score on instances with telemetry disabled."
  (:require
   [metabase-enterprise.semantic-layer.complexity :as complexity]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]))

(set! *warn-on-reflection* true)

(defmethod startup/def-startup-logic! ::PublishSemanticComplexityScore [_]
  (quick-task/submit-task!
   (fn []
     (try
       (complexity/complexity-scores)
       (catch Throwable t
         (log/warn t "Failed to compute semantic complexity score at startup"))))))
