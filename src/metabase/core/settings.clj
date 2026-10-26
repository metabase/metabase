(ns metabase.core.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting deadlock-watchdog-exit
  "Whether Metabase exits (with exit code 3) when it finds the same deadlocked JVM threads on two consecutive checks,
  so the process can be restarted. When false, the deadlock is only logged."
  :type       :boolean
  :default    true
  :visibility :internal
  :setter     :none
  :export?    false
  :doc        true)

(defsetting deadlock-watchdog-interval-seconds
  "How often, in seconds, Metabase checks the JVM for deadlocked threads."
  :type       :integer
  :default    30
  :visibility :internal
  :setter     :none
  :export?    false
  :doc        true)
