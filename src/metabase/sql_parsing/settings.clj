(ns metabase.sql-parsing.settings
  "Env-var-only settings for SQL parsing."
  (:require
   [metabase.settings.core :refer [defsetting]]))

(set! *warn-on-reflection* true)

(defsetting sql-parsing-timeout-ms
  "How long a single SQL parse may run before it is interrupted, in milliseconds."
  :type       :positive-integer
  :default    30000
  :visibility :internal
  :export?    false
  :setter     :none)

(defsetting sql-parsing-shadow-sample-rate
  "Share of calls, from 0.0 to 1.0, that a shadow parser backend also runs on its second parser."
  :type       :double
  :default    1.0
  :visibility :internal
  :export?    false
  :setter     :none)
