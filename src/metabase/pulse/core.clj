(ns ^:deprecated metabase.pulse.core
  "API namespace for the `metabase.pulse` module.

  This namespace is deprecated, soon everything will be migrated to notifications."
  (:require
   [metabase.pulse.dashboard-subscription]
   [metabase.pulse.models.pulse]
   [metabase.pulse.update-alerts]
   [potemkin :as p]))

(comment
  metabase.pulse.dashboard-subscription/keep-me
  metabase.pulse.models.pulse/keep-me
  metabase.pulse.update-alerts/keep-me)

(p/import-vars
 [metabase.pulse.dashboard-subscription
  update-dashboard-subscription-pulses!]
 [metabase.pulse.models.pulse
  retrieve-alerts-for-cards
  update-pulse!]
 [metabase.pulse.update-alerts
  delete-alerts-if-needed!])
