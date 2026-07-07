(ns metabase.dependencies.init
  "Loads the dependency-graph namespaces that register things at load time: models, settings,
  event handlers, and the backfill task."
  (:require
   [metabase.dependencies.calculation]
   [metabase.dependencies.events]
   [metabase.dependencies.models.dependency]
   [metabase.dependencies.models.dependency-status]
   [metabase.dependencies.schema]
   [metabase.dependencies.settings]
   [metabase.dependencies.task.backfill]))
