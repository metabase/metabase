(ns metabase.batch-processing.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting synchronous-batch-updates
  (deferred-tru "Process batches updates synchronously. If true, all `submit!` calls will be processed immediately. Default is false.")
  ;; Should be used for testing purposes only, currently set by some e2e tests
  :type       :boolean
  :default    false
  :export?    true
  ;; :admin instead of :internal because we want to change this during e2e testing
  :visibility :admin)
