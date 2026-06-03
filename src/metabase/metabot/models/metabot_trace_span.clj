(ns metabase.metabot.models.metabot-trace-span
  "OpenTelemetry-style trace spans for a Metabot turn. One trace per assistant
   turn; spans form a tree via `parent_span_id`. Written by
   [[metabase.metabot.tracing]] and read back by the enterprise usage-analytics
   conversation endpoint for the trace waterfall."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotTraceSpan [_model] :metabot_trace_span)

(doto :model/MetabotTraceSpan
  (derive :metabase/model))

(t2/deftransforms :model/MetabotTraceSpan
  {:attributes mi/transform-json
   :events     mi/transform-json
   :kind       mi/transform-keyword
   :status     mi/transform-keyword})
