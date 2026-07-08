(ns metabase-enterprise.content-diagnostics.init
  "Loader for the Content Diagnostics module — pulls in settings and models so their
  `defsetting` / model registrations are registered at startup."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding]
   [metabase-enterprise.content-diagnostics.settings]))
