(ns metabase.root.system-test
  (:require
   [clj-async-profiler.core :as prof]
   [clojure.test :refer :all]
   [metabase.root.mutable-component :as mc]
   [metabase.root.system :as system])
  (:import
   (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(def db-handle (system/mutable-component-handle :db))
(def scheduler-handle (system/mutable-component-handle :scheduler))

(def k1-handle (system/mutable-component-handle :k1))
(def k2-handle (system/mutable-component-handle :k2))
(def k3-handle (system/mutable-component-handle :k3))
(def k4-handle (system/mutable-component-handle :k4))
(def k5-handle (system/mutable-component-handle :k5))

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
  (testing "Bindings layer on a stack: outer-level writes shadow root for inner reads, writer's root updates cascade through both layers for un-overridden keys"
    (mc/alter-root k1-handle :root-k1)
    (mc/alter-root k2-handle :root-k2)
    (mc/alter-root k3-handle :root-k3)
    (mc/alter-root k4-handle :root-k4)
    (mc/alter-root k5-handle :root-k5)
    (let [start-line        (CyclicBarrier. 3)
          root-writer-done  (promise)
          outer-writer-done (promise)
          ;; Spawned at root, so the future's conveyed *system* is the root view
          ;; and its writes land on the root atom.
          root-writer (future
                        (.await start-line)
                        (mc/swap! k2-handle (constantly :updated-k2))
                        (mc/reset! k3-handle :updated-k3)
                        (deliver root-writer-done true))]
      (try
        (mc/binding k1-handle :outer-k1
                    (fn []
                      ;; Spawned inside the outer binding, so binding conveyance
                      ;; gives this future the outer-level *system* and its writes
                      ;; land on the outer atom — not on root.
                      (let [outer-writer (future
                                           (.await start-line)
                                           (mc/swap!  k4-handle (constantly :outer-shadow-k4))
                                           (mc/reset! k5-handle :outer-shadow-k5)
                                           (deliver outer-writer-done true))]
                        (mc/binding k1-handle :inner-k1
                                    (fn []
                                      ;; The main thread sits inside the inner binding
                                      ;; while both writers race.
                                      (.await start-line)
                                      (is (true? (deref root-writer-done 1000 ::timed-out)))
                                      (is (true? (deref outer-writer-done 1000 ::timed-out)))
                                      (testing "inside the inner binding"
                                        (testing "k1 shows the innermost override"
                                          (is (= :inner-k1 (mc/current k1-handle))))
                                        (testing "root writer's updates to k2 and k3 cascade through both layers"
                                          (is (= :updated-k2 (mc/current k2-handle)))
                                          (is (= :updated-k3 (mc/current k3-handle))))
                                        (testing "outer-level shadows on k4 and k5 (written from the outer writer thread) are visible from the inner binding"
                                          (is (= :outer-shadow-k4 (mc/current k4-handle)))
                                          (is (= :outer-shadow-k5 (mc/current k5-handle))))
                                        (testing "`root` bypasses both bindings — sees root writer's updates and ignores outer-level shadows"
                                          (is (= :updated-k2 (mc/root k2-handle)))
                                          (is (= :updated-k3 (mc/root k3-handle)))
                                          (is (= :root-k4 (mc/root k4-handle)))
                                          (is (= :root-k5 (mc/root k5-handle)))))))
                        @outer-writer)
                      (testing "back in the outer binding after the inner pops, outer-level shadows and root cascade are both still visible"
                        (is (= :outer-k1 (mc/current k1-handle)))
                        (is (= :updated-k2 (mc/current k2-handle)))
                        (is (= :updated-k3 (mc/current k3-handle)))
                        (is (= :outer-shadow-k4 (mc/current k4-handle)))
                        (is (= :outer-shadow-k5 (mc/current k5-handle))))))
        (testing "after both bindings unwind, outer-level shadows are gone and root writer's updates remain"
          (is (= :root-k1 (mc/current k1-handle)))
          (is (= :updated-k2 (mc/current k2-handle)))
          (is (= :updated-k3 (mc/current k3-handle)))
          (is (= :root-k4 (mc/current k4-handle)))
          (is (= :root-k5 (mc/current k5-handle))))
        (finally
          @root-writer)))))

(deftest ^:synchronized swap-in-binding-cascades-current-value-test
  (testing "swap! applies f to the cascaded current value of an un-overridden key, not nil"
    (mc/alter-root k1-handle :root-k1)
    (mc/alter-root k2-handle 41)
    (mc/binding k1-handle :bound-k1
                (fn []
                  (mc/swap! k2-handle inc)
                  (testing "swap! read the cascaded root value (41) and wrote (inc 41) to the binding"
                    (is (= 42 (mc/current k2-handle))))
                  (testing "root is unchanged — the swap! landed on the binding atom"
                    (is (= 41 (mc/root k2-handle))))))
    (testing "after the binding pops, the root value is unchanged"
      (is (= 41 (mc/current k2-handle))))))

(deftest ^:synchronized swap-2arity-in-binding-cascades-current-value-test
  (testing "the 2-arity swap! also reads the cascaded current value for un-overridden keys"
    (mc/alter-root k1-handle :root-k1)
    (mc/alter-root k2-handle {:answer 41})
    (mc/binding k1-handle :bound-k1
                (fn []
                  (mc/swap! k2-handle update [:answer inc])
                  (testing "swap! read the cascaded root map and applied (update m :answer inc)"
                    (is (= {:answer 42} (mc/current k2-handle))))
                  (testing "root is unchanged"
                    (is (= {:answer 41} (mc/root k2-handle))))))))

(deftest ^:synchronized binding-nil-override-shadows-root-test
  (testing "binding a key to nil explicitly shadows root's non-nil value"
    (mc/alter-root k1-handle :root-k1)
    (mc/binding k1-handle nil
                (fn []
                  (testing "current returns the nil override, not the root value"
                    (is (nil? (mc/current k1-handle))))
                  (testing "root is unaffected"
                    (is (= :root-k1 (mc/root k1-handle))))))
    (testing "after the binding pops, the root value is restored"
      (is (= :root-k1 (mc/current k1-handle))))))

(deftest ^:synchronized alter-root-from-binding-test
  (testing "alter-root from inside a binding writes root, ignoring the active binding on this thread"
    (mc/alter-root k1-handle :root-k1)
    (mc/binding k1-handle :bound-k1
                (fn []
                  (mc/alter-root k1-handle :new-root-k1)
                  (testing "the binding still shadows the new root from this thread's view"
                    (is (= :bound-k1 (mc/current k1-handle))))
                  (testing "`root` reflects the new root value"
                    (is (= :new-root-k1 (mc/root k1-handle))))))
    (testing "after the binding pops, the new root is visible"
      (is (= :new-root-k1 (mc/current k1-handle))))))

(comment
  (let [iterations 100]
    (prof/profile
     {:event :cpu :title "metabase.root.system-test"}
     (dotimes [_ iterations]
       (dynamic-binding-test))
     (dotimes [_ iterations]
       (root-binding-test))))

  (prof/serve-ui 9111))
