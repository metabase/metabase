(ns metabase-enterprise.content-diagnostics.init
  "Loader for the Content Diagnostics module - pulls in settings, models, and the scheduled tasks so
  their `defsetting` / model registrations / `task/init!` methods are registered at startup."
  (:require
   [metabase-enterprise.content-diagnostics.events]
   [metabase-enterprise.content-diagnostics.models.finding]
   [metabase-enterprise.content-diagnostics.settings]
   [metabase-enterprise.content-diagnostics.task.finding-trimmer]
   [metabase-enterprise.content-diagnostics.task.scan]))
