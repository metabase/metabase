(ns metabase.tracing.init
  "Side-effect loading for the tracing module.
   Loads settings (for env var recognition) and quartz tracing (for task/init! registration)."
  (:require
   [metabase.tracing.quartz]
   [metabase.tracing.settings]))
