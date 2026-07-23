(ns metabase-enterprise.content-diagnostics.init
  "Loader for the Content Diagnostics module — pulls in settings, models, and the scan task so their
  `defsetting` / model registrations / `task/init!` method are registered at startup."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding]
   [metabase-enterprise.content-diagnostics.settings]
   [metabase-enterprise.content-diagnostics.task.scan]))
