(ns metabase.util.grouper
  "Our wrapper for grouper -- the batch processing utility.

  Note:
  - These utilities should only be used for scenarios where data consistency is not a requirement,
    Execution is best effort and may not occur as the batched items are not persisted.
  - Suitable for use cases that can tolerate lag time in processing. For example, updating
    last_used_at of cards after a query execution. Things like recording view_log should not use
    grouper since it's important to have the data immediately available.


  Batch processing can be disabled by setting the environment variable `MB_DISABLE_GROUPER_BATCH_PROCESSING=true`."
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [grouper.core :as grouper]
   [metabase.models.setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [potemkin :as p])
  (:import
   (grouper.core Grouper)))

(set! *warn-on-reflection* true)

(comment
 p/keep-me
 Grouper/keep-me)

(defsetting synchronous-batch-updates
  (deferred-tru "Process batches updates synchronously. If true, all `submit!` calls will be processed immediately. Default is false.")
  ;; Should be used for testing purposes only, currently set by some e2e tests
  :type       :boolean
  :default    false
  :export?    true
  ;; :admin instead of :internal because we want to change this during e2e testing
  :visibility :admin)

(p/import-vars
 [grouper
  start!
  shutdown!])

(defn submit!
  "A wrapper of [[grouper.core/submit!]] that returns nil instead of a promise.
  We use grouper for fire-and-forget scenarios, so we don't care about the result."
  [& args]
  (let [p (apply grouper/submit! args)]
    (when (synchronous-batch-updates)
      ;; wake up the group immediately and wait for it to finish
      (.wakeUp ^Grouper (first args))
      (deref p))
    nil))
