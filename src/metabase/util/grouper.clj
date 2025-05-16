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
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [grouper.core :as grouper]
   [metabase.db :as mdb]
   [metabase.settings.core :refer [defsetting]]
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
  [^Grouper grouper thunk & options]
  (let [synchronous? (or (synchronous-batch-updates)
                         ;; if we're in the middle of a transaction, we need to do this synchronously in case we roll
                         ;; back the transaction at the end (as we do in tests)
                         (mdb/in-transaction?))
        ;; If we're running synchronously, capture all the currently bound dynamic variables, including the current
        ;; connection (so we can reuse it for doing Grouper stuff). If we're running asynchronously, capture everything
        ;; but the current Toucan 2 connection and transaction depth (used to track whether we're in a transaction
        ;; already or not).
        thunk        (if synchronous?
                       (bound-fn* thunk)
                       (mdb/with-ignored-current-connection
                         (bound-fn* thunk)))
        p            (apply grouper/submit! grouper thunk options)]
    (when synchronous?
      ;; wake up the group immediately and wait for it to finish
      (.wakeUp grouper)
      (deref p))
    nil))
