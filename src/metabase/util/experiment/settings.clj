(ns metabase.util.experiment.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.experiment :as experiment]
   [metabase.util.i18n :refer [deferred-tru]]))

#_{:clj-kondo/ignore [:metabase/defsetting-namespace]}
(defsetting experiments-enabled
  (deferred-tru "Enable or disable all code experiments. When disabled, only the production code path runs.")
  :type       :boolean
  :default    true
  :visibility :admin
  :export?    false
  :audit      :getter)

;; Wire the setting into the experiment system. The function is called on every experiment
;; invocation, so toggling the setting in the admin panel takes effect immediately.
(experiment/set-experiments-enabled-fn! experiments-enabled)
