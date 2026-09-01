(ns metabase.test.sync
  (:require
   [clojure.test :refer :all]
   [metabase.sync.core :as sync]
   [metabase.test.data :as data]
   [toucan2.core :as t2]))

;; deliberately has no root value: the reader below checks `bound?` to tell a live cache from no cache at all
#_{:clj-kondo/ignore [:uninitialized-var]}
(def ^:private ^:dynamic *sync-steps-run-to-completion-cache*)

(defn sync-steps-run-to-completion
  "Returns the number of sync steps that run succesfully by counting entries in `TaskHistory`"
  []
  (data/with-temp-copy-of-db
    ;; `sync-database!` does both sync an analysis steps
    (sync/sync-database! (t2/select-one :model/Database 'id (data/id)))
    (t2/count :model/TaskHistory 'db_id (data/id))))

(defn crash-fn
  "A function that always crashes"
  [& _]
  (throw (Exception. "simulated exception")))

(defn cached-sync-steps-run-to-completion
  "If `*sync-steps-run-to-completion-cache*` is bound, use the value stored in it if present, or compute the number of
  sync steps and store there. When not bound, just compute on each invocation."
  []
  (if (bound? #'*sync-steps-run-to-completion-cache*)
    (or *sync-steps-run-to-completion-cache*
        (let [steps (sync-steps-run-to-completion)]
          (set! *sync-steps-run-to-completion-cache* steps)
          steps))
    (sync-steps-run-to-completion)))

(defn cache-normal-sync-steps-fixture [f]
  (binding [*sync-steps-run-to-completion-cache* nil]
    (f)))

(defmacro sync-survives-crash?!
  "Can sync process survive `f` crashing?"
  [f]
  `(is (= (cached-sync-steps-run-to-completion)
          (with-redefs [~f crash-fn]
            (sync-steps-run-to-completion)))))
