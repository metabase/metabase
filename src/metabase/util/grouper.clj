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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
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
  shutdown!])

;;; for synchronous processing we need to maintain the dynamic variables that the task was submitted with, so for
;;; example if we submitted it inside of a `with-temp` block we run using the current transaction instead of creating a
;;; new one on a different thread. So instead of submitting a bunch of objects, we'll actually wrap them and submit
;;; items like
;;;
;;;    {:object object, :do-in-context (fn [thunk] (thunk))}
;;;
;;; then when Grouper actually runs our task we'll do it INSIDE of the `do-in-context` function if we have one to get
;;; the bound connection and what not. Our version of [[start!]] will unwrap stuff and make this transparent to its
;;; users.
(mu/defn start!
  "Wrapper around [[grouper/start!]]."
  ^Grouper [f :- [:or (ms/InstanceOfClass clojure.lang.Var) fn?] & options]
  (let [f* (fn [items]
             (let [do-in-context (last (keep :do-in-context items))
                   objects       (map :object items)]
               (if do-in-context
                 (do-in-context (^:once fn* [] (f objects)))
                 (f objects))))]
    (apply grouper/start! f* options)))

(mu/defn submit!
  "A wrapper of [[grouper.core/submit!]] that returns nil instead of a promise.
   We use grouper for fire-and-forget scenarios, so we don't care about the result."
  [^Grouper grouper :- (ms/InstanceOfClass Grouper) object & options]
  (let [synchronous?   (or (synchronous-batch-updates)
                           ;; if we're in the middle of a transaction, we need to do this synchronously in case we roll
                           ;; back the transaction at the end (as we do in tests)
                           (mdb/in-transaction?))

        do-in-context (when synchronous?
                        (bound-fn* (fn do-in-context [thunk]
                                     (thunk))))
        p            (apply grouper/submit! grouper {:object object, :do-in-context do-in-context} options)]
    (when synchronous?
      ;; wake up the group immediately and wait for it to finish
      (.wakeUp grouper)
      (let [result (deref p)]
        (when (instance? Throwable result)
          (throw result))))
    nil))
