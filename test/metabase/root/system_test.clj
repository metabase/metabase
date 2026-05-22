(ns metabase.root.system-test
  (:require
   [clj-async-profiler.core :as prof]
   [clojure.test :refer :all]
   [metabase.root.mutable-component :as mc]
   [metabase.root.system :as system]))

(set! *warn-on-reflection* true)

(def db-handle (system/mutable-component-handle :db))
(def scheduler-handle (system/mutable-component-handle :scheduler))

(def k1-handle (system/mutable-component-handle :k1))
(def k2-handle (system/mutable-component-handle :k2))
(def k3-handle (system/mutable-component-handle :k3))

(def op-delay 10)

(defn take-a-while
  []
  (dotimes [_ (* op-delay 1000000)] (inc 0)))

(defn get-db
  []
  (take-a-while)
  (mc/current db-handle))

(defn get-db-from-scheduler
  []
  (mc/current db-handle))

(defn scheduler
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
                                 (let [observed (get-db-from-scheduler)]
                                   (reset! mailbox (promise))
                                   (deliver reply observed)
                                   (recur))))))]
                 (fn stop!* []
                   (deliver @mailbox ::stop)
                   (deref fut 1000 ::timed-out)))}))

(defn scheduler-sees
  []
  (take-a-while)
  ((:read-db! (mc/current scheduler-handle))))

(defn reset-db!
  [x]
  (mc/reset! db-handle x))

(defn global-setup!
  []
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db))

(deftest ^:synchronized dynamic-binding-test
  (global-setup!)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Dynamic binding is seen only from dynamic scope"
        (mc/binding db-handle :uninit-dynamic-db
                    (fn dynamic-test-scope []
                      (is (= :uninit-dynamic-db (get-db)))
                      (is (= :ready-global-db (scheduler-sees)))
                      (reset-db! :ready-dynamic-db)
                      (is (= :ready-dynamic-db (get-db)))
                      (is (= :ready-global-db (scheduler-sees))))))

      (testing "After the binding scope ends, the global value is restored."
        (is (= :ready-global-db (get-db)))
        (is (= :ready-global-db (scheduler-sees))))
      (finally
        ((:stop! sched))))))

(deftest ^:synchronized root-binding-test
  (global-setup!)
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try
      (testing "Root binding changes are seen on all threads"
        (mc/alter-root db-handle :uninit-global-db)
        (is (= :uninit-global-db (get-db)))
        (is (= :uninit-global-db (scheduler-sees))))
      (testing "Atom mutations on the root atom are seen on all threads"
        (reset-db! :ready-global-db)
        (is (= :ready-global-db (get-db)))
        (is (= :ready-global-db (scheduler-sees))))

      (finally
        ((:stop! sched))))))

(deftest ^:synchronized binding-reads-through-to-root-test
  (testing "Inside a binding for k1, concurrent root mutations to k2 (via swap!) and k3 (via reset!) should be visible — the override is sparse and reads fall through for un-overridden keys"
    (mc/alter-root k1-handle :root-k1)
    (mc/alter-root k2-handle :root-k2)
    (mc/alter-root k3-handle :root-k3)
    (let [bound-thread-entered (promise)
          writes-done          (promise)
          writer (future
                   (deref bound-thread-entered 1000 ::timed-out)
                   (mc/swap! k2-handle (constantly :updated-k2))
                   (mc/reset! k3-handle :updated-k3)
                   (deliver writes-done true))]
      (try
        (mc/binding k1-handle :bound-k1
                    (fn []
                      (deliver bound-thread-entered true)
                      (is (true? (deref writes-done 1000 ::timed-out)))
                      (testing "the bound thread sees its own override for k1"
                        (is (= :bound-k1 (mc/current k1-handle))))
                      (testing "the writer's root updates to k2 and k3 are visible from inside the binding"
                        (is (= :updated-k2 (mc/current k2-handle)))
                        (is (= :updated-k3 (mc/current k3-handle))))
                      (testing "`root` also reflects the writer's updates"
                        (is (= :updated-k2 (mc/root k2-handle)))
                        (is (= :updated-k3 (mc/root k3-handle))))))
        (finally
          @writer)))))

(deftest ^:synchronized nested-binding-reads-through-to-root-test
  (testing "Even from a nested binding (so we're not on the root system to begin with), concurrent root writes should still be visible for un-overridden keys"
    (mc/alter-root k1-handle :root-k1)
    (mc/alter-root k2-handle :root-k2)
    (mc/alter-root k3-handle :root-k3)
    (let [bound-thread-entered (promise)
          writes-done          (promise)
          writer (future
                   (deref bound-thread-entered 1000 ::timed-out)
                   (mc/swap! k2-handle (constantly :updated-k2))
                   (mc/reset! k3-handle :updated-k3)
                   (deliver writes-done true))]
      (try
        (mc/binding k1-handle :outer-k1
                    (fn []
                      (mc/binding k1-handle :inner-k1
                                  (fn []
                                    (deliver bound-thread-entered true)
                                    (is (true? (deref writes-done 1000 ::timed-out)))
                                    (testing "inside the inner binding"
                                      (testing "k1 shows the innermost override"
                                        (is (= :inner-k1 (mc/current k1-handle))))
                                      (testing "the writer's root updates to k2 and k3 read through both binding layers"
                                        (is (= :updated-k2 (mc/current k2-handle)))
                                        (is (= :updated-k3 (mc/current k3-handle))))
                                      (testing "`root` also reflects the writer's updates"
                                        (is (= :updated-k2 (mc/root k2-handle)))
                                        (is (= :updated-k3 (mc/root k3-handle)))))))
                      (testing "back in the outer binding after the inner pops, the root cascade still flows through"
                        (is (= :outer-k1 (mc/current k1-handle)))
                        (is (= :updated-k2 (mc/current k2-handle)))
                        (is (= :updated-k3 (mc/current k3-handle))))))
        (testing "after both bindings unwind, root reads reflect the writer's updates"
          (is (= :root-k1 (mc/current k1-handle)))
          (is (= :updated-k2 (mc/current k2-handle)))
          (is (= :updated-k3 (mc/current k3-handle))))
        (finally
          @writer)))))

(comment
  (let [iterations 100]
    (prof/profile
     {:event :cpu :title "metabase.root.system-test"}
     (dotimes [_ iterations]
       (dynamic-binding-test))
     (dotimes [_ iterations]
       (root-binding-test))))

  (prof/serve-ui 9111))
