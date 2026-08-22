(ns metabase.global-system.system-test
  (:require
   [clojure.test :refer :all]
   [metabase.global-system.mutable-component :as mc]
   [metabase.global-system.system :as system])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(def ^:private db-handle (system/mutable-component-handle :db))
(def ^:private scheduler-handle (system/mutable-component-handle :scheduler))
(def ^:private other-handle (system/mutable-component-handle :other))

(defn- scheduler
  "A worker thread that runs thunks handed to it and returns their results. Running on a second thread is
   the only way to tell a root value from a thread-local one, since a thread-local binding is invisible
   from anywhere else."
  []
  (let [requests (LinkedBlockingQueue.)
        fut      (future
                   (loop []
                     (let [request (.take requests)]
                       (if (= request ::stop)
                         ::finished
                         (let [[thunk reply] request]
                           (deliver reply (thunk))
                           (recur))))))]
    {:run!  (fn [thunk]
              (let [reply (promise)]
                (.put requests [thunk reply])
                (deref reply 1000 ::timed-out)))
     :stop! (fn []
              (.put requests ::stop)
              (deref fut 1000 ::timed-out))}))

(defn- scheduler-runs
  [thunk]
  ((:run! @scheduler-handle) thunk))

(defn- scheduler-sees
  []
  (scheduler-runs (fn [] @db-handle)))

(defn- do-with-scheduler
  "Install a running scheduler as the `:scheduler` component for the duration of `thunk`, stopping it after."
  [thunk]
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try (thunk)
         (finally ((:stop! sched))))))

(defn- global-setup!
  []
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db))

(deftest ^:synchronized dynamic-binding-test
  (do-with-scheduler
   (fn []
     (global-setup!)
     (is (= :ready-global-db @db-handle))
     (is (= :ready-global-db (scheduler-sees)))
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
       (is (= :ready-global-db (scheduler-sees)))))))

(deftest ^:synchronized root-binding-test
  (do-with-scheduler
   (fn []
     (global-setup!)
     (is (= :ready-global-db @db-handle))
     (is (= :ready-global-db (scheduler-sees)))
     (testing "Root binding changes are seen on all threads"
       (mc/alter-root db-handle :uninit-global-db)
       (is (= :uninit-global-db @db-handle))
       (is (= :uninit-global-db (scheduler-sees))))
     (testing "Atom mutations on the root atom are seen on all threads"
       (mc/reset! db-handle :closed-global-db)
       (is (= :closed-global-db @db-handle))
       (is (= :closed-global-db (scheduler-sees)))))))

(deftest ^:synchronized components-are-independent-test
  (testing "binding one component neither freezes nor hides any other, so that holding N components in one
            var behaves the same as holding each in its own var"
    (do-with-scheduler
     (fn []
       (global-setup!)
       (mc/alter-root other-handle :root-other)
       (mc/binding db-handle :bound-db
                   (fn inside-db-binding []
                     (testing "an unbound component still reads its root"
                       (is (= :root-other @other-handle)))
                     (testing "a mutation to another component made on another thread is visible in here"
                       (scheduler-runs (fn [] (mc/reset! other-handle :mutated-elsewhere)))
                       (is (= :mutated-elsewhere @other-handle)))
                     (testing "a mutation to another component made in here is visible everywhere else"
                       (mc/reset! other-handle :mutated-in-here)
                       (is (= :mutated-in-here (scheduler-runs (fn [] @other-handle)))))
                     (testing "another component's root replaced on another thread is visible in here"
                       (scheduler-runs (fn [] (mc/alter-root other-handle :re-rooted-elsewhere)))
                       (is (= :re-rooted-elsewhere @other-handle)))
                     (testing "the bound component keeps its own value throughout"
                       (is (= :bound-db @db-handle)))))
       (testing "replacing one component's root leaves the others alone"
         (mc/alter-root other-handle 0)
         (mc/swap! other-handle inc)
         (mc/alter-root db-handle :re-rooted-db)
         (is (= 1 @other-handle))
         (is (= 1 (scheduler-runs (fn [] @other-handle)))))))))

(deftest ^:synchronized snapshot-test
  (mc/alter-root db-handle :root-db)
  (mc/alter-root other-handle :root-other)
  (testing "a snapshot carries every component's root value"
    (let [snap (system/snapshot)]
      (is (= :root-db (:db snap)))
      (is (= :root-other (:other snap)))))
  (testing "a snapshot is a value, so later mutations cannot appear in one already taken"
    (let [snap (system/snapshot)]
      (mc/reset! other-handle :mutated-other)
      (is (= :root-other (:other snap)))
      (is (= :mutated-other (:other (system/snapshot))))))
  (testing "a snapshot agrees with dereferencing each handle, bound components included"
    (mc/binding db-handle :bound-db
                (fn []
                  (is (= :bound-db @db-handle))
                  (is (= :bound-db (:db (system/snapshot))))))))

(deftest ^:synchronized multi-component-write-test
  (do-with-scheduler
   (fn []
     (mc/alter-root db-handle :root-db)
     (mc/alter-root other-handle :root-other)
     (mc/binding db-handle :bound-db
                 (fn []
                   (mc/binding other-handle 0
                               (fn []
                                 (mc/reset! db-handle :written-db)
                                 (mc/swap! other-handle inc)
                                 (testing "every component written in the scope reads back what this thread wrote"
                                   (is (= :written-db @db-handle))
                                   (is (= 1 @other-handle)))
                                 (testing "and the whole system still reads consistently, with all the writes in it"
                                   (is (= {:db    :written-db
                                           :other 1}
                                          (select-keys (system/snapshot) [:db :other]))))
                                 (testing "while another thread sees none of the writes"
                                   (is (= {:db    :root-db
                                           :other :root-other}
                                          (scheduler-runs (fn [] (select-keys (system/snapshot) [:db :other]))))))))))
     (testing "and the roots are untouched once the scope ends"
       (is (= :root-db @db-handle))
       (is (= :root-other @other-handle))))))

(deftest ^:synchronized unknown-component-test
  (testing "reading a component that was never given a value fails loudly rather than returning nil"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Component has no value"
         @(system/mutable-component-handle ::never-set)))))
