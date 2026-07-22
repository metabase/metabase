(ns metabase.global-system.system-test
  (:require
   [clojure.test :refer :all]
   [metabase.global-system.mutable-component :as mc]
   [metabase.global-system.system :as system])
  (:import (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(def db-handle (system/mutable-component-handle :db))
(def scheduler-handle (system/mutable-component-handle :scheduler))

#_(defn scheduler
    []
    (let [mailbox (atom (promise))]
      {:state    :running
       :read-db! (fn read-db!* []
                   (let [reply (promise)]
                     (deliver @mailbox reply)
                     (deref reply 1000 ::timed-out)))
       :stop!    (let [fut (future
                             (loop []
                               (let [reply @@mailbox]
                                 (when-not (= reply ::stop)
                                   (let [observed @db-handle]
                                     (reset! mailbox (promise))
                                     (deliver reply observed)
                                     (recur))))))]
                   (fn stop!* []
                     (deliver @mailbox ::stop)
                     (deref fut 1000 ::timed-out)))}))

(defn scheduler []
  (let [requests (LinkedBlockingQueue.)
        fut      (future
                   (loop []
                     (let [reply (.take requests)]
                       (if (= reply ::stop)
                         ::finished
                         (do (deliver reply @db-handle)
                             (recur))))))]
    {:read-db! (fn []
                 (let [reply (promise)]
                   (.put requests reply)
                   (deref reply 1000 ::timed-out)))
     :stop!    (fn []
                 (.put requests ::stop)
                 (deref fut 1000 ::timed-out))}))

(defn- scheduler-sees
  []
  ((:read-db! @scheduler-handle)))

(defn- global-setup!
  []
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db))

(deftest ^:synchronized dynamic-binding-test
  (global-setup!)
  (is (= :ready-global-db @db-handle))
  (is (= :ready-global-db (scheduler-sees)))
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Dynamic binding is seen only from dynamic scope"
        (mc/binding db-handle :uninit-dynamic-db
                    (fn dynamic-test-scope []
                      (is (= :uninit-dynamic-db @db-handle))
                      (is (= :ready-global-db (scheduler-sees)))
                      (mc/reset! db-handle :ready-dynamic-db)
                      (is (= :ready-dynamic-db @db-handle))
                      (is (= :ready-global-db (scheduler-sees))))))
      (testing "After the binding scope ends, the global value is restored."
        (is (= :ready-global-db @db-handle))
        (is (= :ready-global-db (scheduler-sees))))
      (finally
        ((:stop! sched))))))

(deftest ^:synchronized root-binding-test
  (global-setup!)
  (is (= :ready-global-db @db-handle))
  (is (= :ready-global-db (scheduler-sees)))
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Root binding changes are seen on all threads"
        (mc/alter-root db-handle :uninit-global-db)
        (is (= :uninit-global-db @db-handle))
        (is (= :uninit-global-db (scheduler-sees))))
      (testing "Atom mutations on the root atom are seen on all threads"
        (mc/reset! db-handle :closed-global-db)
        (is (= :closed-global-db @db-handle))
        (is (= :closed-global-db (scheduler-sees))))
      (finally
        ((:stop! sched))))))
