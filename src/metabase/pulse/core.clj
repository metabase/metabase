(ns metabase.pulse.core
  "API namespace for the `metabase.pulse` module.

  This namespace is deprecated, soon everything will be migrated to notifications."
  (:require
   [metabase.pulse.models.pulse]
   [metabase.pulse.update-alerts]
   [metabase.pulse.write]
   [potemkin :as p]))

(comment
  metabase.pulse.models.pulse/keep-me
  metabase.pulse.update-alerts/keep-me
  metabase.pulse.write/keep-me)

(p/import-vars
 [metabase.pulse.models.pulse
  card->ref
  maybe-filter-pulse-recipients
  maybe-strip-sensitive-metadata
  retrieve-alert
  retrieve-alerts-for-cards
  retrieve-pulse]
 [metabase.pulse.write
  update-pulse!]
 [metabase.pulse.update-alerts
  delete-alerts-if-card-changed!
  alerts-of-card-being-changed
  notify-alerts-deleted!])
