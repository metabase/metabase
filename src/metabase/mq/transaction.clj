(ns metabase.mq.transaction
  "Shared helper for deferring queue publishes to the surrounding DB transaction's boundaries."
  (:require
   [metabase.app-db.core :as mdb]))

(set! *warn-on-reflection* true)

(defn accumulate-and-register!
  "Accumulate `msgs` for `channel` under `[msgs-key channel]` in the current transaction's state atom,
  and run `register-once!` exactly the first time this is called for `registered-key` within that
  transaction.

  `register-once!` is passed the transaction `state` atom — captured here and handed over explicitly
  because after-commit callbacks run after the dynamic [[mdb/transaction-state]] has unwound, so they
  can't read it live. Must be called inside a transaction."
  [msgs-key registered-key channel msgs register-once!]
  (let [state (mdb/transaction-state)
        old   (first (swap-vals! state
                                 (fn [s]
                                   (-> s
                                       (update-in [msgs-key channel] (fnil into []) msgs)
                                       (assoc registered-key true)))))]
    (when-not (get old registered-key)
      (register-once! state))))
