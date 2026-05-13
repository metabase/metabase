(ns metabase.root.system-test
  (:require
   [clojure.test :refer :all]
   [metabase.root.mutable-component :as mc]
   [metabase.root.system :as system]))

(set! *warn-on-reflection* true)

(def db-handle (system/mutable-component-handle :db))
(def scheduler-handle (system/mutable-component-handle :scheduler))

(defn scheduler
  []
  (let [mailbox (atom (promise))]
    {:state    :running
     :read-db! (fn []
                 (let [reply (promise)]
                   (deliver @mailbox reply)
                   (deref reply 1000 ::timed-out)))
     :stop!    (let [fut (future
                           (loop []
                             (let [reply @@mailbox]
                               (when-not (= reply ::stop)
                                 (let [observed (mc/current db-handle)]
                                   (reset! mailbox (promise))
                                   (deliver reply observed)
                                   (recur))))))]
                 (fn []
                   (deliver @mailbox ::stop)
                   (deref fut 1000 ::timed-out)))}))

(defn scheduler-sees
  []
  ((:read-db! (mc/current scheduler-handle))))

(deftest ^:synchronized dynamic-binding-test
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Dynamic binding is seen only from dynamic scope"
        (mc/binding db-handle :uninit-dynamic-db
                    (fn []
                      (is (= :uninit-dynamic-db (mc/current db-handle)))
                      (is (= :ready-global-db (scheduler-sees)))
                      (mc/reset! db-handle :ready-dynamic-db)
                      (is (= :ready-dynamic-db (mc/current db-handle)))
                      (is (= :ready-global-db (scheduler-sees))))))

      (testing "After the binding scope ends, the global value is restored."
        (is (= :ready-global-db (mc/current db-handle)))
        (is (= :ready-global-db (scheduler-sees))))
      (finally
        ((:stop! sched))))))

(deftest ^:synchronized root-binding-test
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Root binding changes are seen on all threads"
        (mc/alter-root db-handle :uninit-global-db)
        (is (= :uninit-global-db (mc/current db-handle)))
        (is (= :uninit-global-db (scheduler-sees))))
      (testing "Atom mutations on the root atom are seen on all threads"
        (mc/reset! db-handle :ready-global-db-db)
        (is (= :ready-global-db-db (mc/current db-handle)))
        (is (= :ready-global-db-db (scheduler-sees))))

      (finally
        ((:stop! sched))))))
