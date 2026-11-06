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
