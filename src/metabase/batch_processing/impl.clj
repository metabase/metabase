(ns metabase.batch-processing.impl
  "Our wrapper for grouper -- the batch processing utility.

  Note:
  - These utilities should only be used for scenarios where data consistency is not a requirement,
    Execution is best effort and may not occur as the batched items are not persisted.
  - Suitable for use cases that can tolerate lag time in processing. For example, updating
    last_used_at of cards after a query execution. Things like recording view_log should not use
    grouper since it's important to have the data immediately available.


  Batch processing can be disabled by setting the environment variable `MB_SYNCHRONOUS_BATCH_UPDATES=true`"
  (:require
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [grouper.core :as grouper]
   [metabase.app-db.core :as mdb]
   [metabase.batch-processing.settings :as batch-processing.settings]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (grouper.core Grouper)))

(set! *warn-on-reflection* true)

;;; the sole purpose of this wrapper is so we can keep the original function around so we can call it directly on the
;;; current thread if we're processing stuff synchronously
(mr/def ::fn-or-var
  [:or (ms/InstanceOfClass clojure.lang.Var) fn?])

(mr/def ::grouper-wrapper
  [:map
   [:f       ::fn-or-var]
   [:grouper (ms/InstanceOfClass Grouper)]])

(mu/defn start! :- ::grouper-wrapper
  "Wrapper around [[grouper/start!]]."
  [f :- ::fn-or-var & options]
  ;; this wrapper is so we can use Vars which Grouper normally doesn't allow.
  #_{:clj-kondo/ignore [:redundant-fn-wrapper]}
  (let [f*      (fn [items]
                  (f items))
        grouper (apply grouper/start! f* options)]
    {:f f, :grouper grouper}))

(mu/defn shutdown!
  "Wrapper around [[grouper/shutdown!]]."
  [grouper :- ::grouper-wrapper]
  (grouper/shutdown! (:grouper grouper)))

(mu/defn submit!
  "A wrapper of [[grouper.core/submit!]] that returns nil instead of a promise.
   We use grouper for fire-and-forget scenarios, so we don't care about the result."
  [grouper-wrapper :- ::grouper-wrapper object & options]
  (let [synchronous? (or (batch-processing.settings/synchronous-batch-updates)
                         ;; if we're in the middle of a transaction, we need to do this synchronously in case we roll
                         ;; back the transaction at the end (as we do in tests)
                         (mdb/in-transaction?))]
    (if synchronous?
      (let [f (:f grouper-wrapper)]
        (f [object]))
      (apply grouper/submit! (:grouper grouper-wrapper) object options))
    nil))
