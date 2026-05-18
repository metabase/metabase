(ns metabase.explorations.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting explorations-worker-count
  (deferred-tru "Number of concurrent background workers draining the explorations queue. Ignored on H2 (which is hardcoded to 1 because it lacks SKIP LOCKED).")
  :type       :integer
  :default    2
  :visibility :internal
  :export?    false)
