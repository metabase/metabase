(ns metabase.root.system-test
  (:require
   [clojure.test :refer :all]
   [metabase.root.mutable-component :as mc]
   [metabase.root.system :as system]))

(set! *warn-on-reflection* true)

(def db-handle        (system/mutable-component-handle :db))
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

(deftest ^:synchronized dynamic-binding-test
  (mc/alter-root db-handle :uninitialized-global)
  (mc/reset! db-handle :initialized-global)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Inside the dynamic binding: uninit -> reset! -> SUT sees initialized."
        (mc/binding db-handle :uninitialized-dynamic
                    (fn []
                      (is (= :uninitialized-dynamic (mc/current db-handle))
                          "Before the imperative init the dynamic value is visible.")
                      (is (= :initialized-global (mc/root db-handle))
                          "Root is unaffected by the dynamic binding.")

                      (mc/reset! db-handle :initialized-dynamic)

                      (is (= :initialized-dynamic (mc/current db-handle))
                          "SUT, called on the same thread, sees the dynamically-mutated value.")
                      (is (= :initialized-global (mc/root db-handle))
                          "Root is still unaffected after the atom mutation.")

                      (is (= :initialized-global ((:read-db! (mc/current scheduler-handle))))
                          "Scheduler thread, asked from inside the dynamic binding, still sees the root."))))

      (testing "After the binding scope ends, the global value is restored."
        (is (= :initialized-global (mc/current db-handle)))
        (is (= :initialized-global ((:read-db! (mc/current scheduler-handle))))
            "Scheduler thread sees the same root value outside the binding scope."))
      (finally
        ((:stop! sched))))))

(deftest ^:synchronized root-binding-test
  (mc/alter-root db-handle :uninitialized-global)
  (mc/reset! db-handle :initialized-global)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (mc/alter-root db-handle :uninitialized-root)

      (is (= :uninitialized-root (mc/current db-handle)))
      (is (= :uninitialized-root (mc/root db-handle))
          "alter-root affects both `current` and `root` views (no dynamic binding present).")

      (mc/reset! db-handle :initialized-root)

      (is (= :initialized-root (mc/current db-handle))
          "SUT, called on the test thread with no dynamic binding, sees the new root value.")

      (testing "Scheduler thread, asked after alter-root, observes the new root value."
        (is (= :initialized-root ((:read-db! (mc/current scheduler-handle))))))
      (finally
        ((:stop! sched))))))
