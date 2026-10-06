(ns metabase.bug-reporting.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting bug-reporting-enabled
  (deferred-tru "Enable bug report submissions.")
  :visibility :public
  :export?    false
  :type       :boolean
  :default    false
  :setter     :none
  :audit      :getter)

;; [test] Test-gate check: a backend-only change. Not for merge.
