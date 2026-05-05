(ns metabase.pulse.core
  "API namespace for the `metabase.pulse` module.

  This namespace is deprecated, soon everything will be migrated to notifications."
  (:require
   [metabase.pulse.models.pulse]
   [metabase.pulse.update-alerts]
   [potemkin :as p]))

(comment
  metabase.pulse.models.pulse/keep-me
  metabase.pulse.update-alerts/keep-me)

(p/import-vars
 [metabase.pulse.models.pulse
  card->ref
  retrieve-alerts-for-cards
  update-pulse!]
 [metabase.pulse.update-alerts
  delete-alerts-if-needed!])
