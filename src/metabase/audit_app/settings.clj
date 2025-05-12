(ns metabase.audit-app.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting last-analytics-checksum
  "A place to save the analytics-checksum, to check between app startups. If set to -1, skips the checksum process
  entirely to avoid calculating checksums in environments (e2e tests) where we don't care."
  :type       :integer
  :visibility :internal
  :audit      :never
  :doc        false
  :export?    false)
