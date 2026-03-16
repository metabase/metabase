(ns metabase.tracing.init
  "Side-effect loading for the tracing module.
   Loads settings (for env var recognition), quartz tracing (for task/init! registration),
   and event tracing (for publish-event! instrumentation)."
  (:require
   [metabase.tracing.events]
   [metabase.tracing.quartz]
   [metabase.tracing.settings]))
