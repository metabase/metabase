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

;; Holding N components in one var should behave the same as holding each in its own var.
(deftest ^:synchronized components-are-independent-test
  (testing "binding one component neither freezes nor hides any other"
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
  (let [never-set (system/mutable-component-handle ::never-set)
        no-value  #"Component has no value"]
    (testing "reading a component that was never given a value fails loudly rather than returning nil"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value @never-set)))
    (testing "so do writes, since only alter-root installs a component"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value (mc/reset! never-set 1)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value (mc/swap! never-set (fnil inc 0)))))
    (testing "the failed writes leave the component uninstalled"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value @never-set)))
    (testing "a binding works without a root, and writes inside it go to the binding"
      (mc/binding never-set 1
                  (fn []
                    (is (= 2 (mc/swap! never-set inc)))
                    (is (= 2 @never-set))))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value @never-set)))))

(deftest ^:synchronized nil-binding-test
  (testing "binding a component to nil hides a non-nil root"
    (do-with-scheduler
     (fn []
       (mc/alter-root db-handle :root-db)
       (mc/binding db-handle nil
                   (fn []
                     (is (nil? @db-handle))
                     (is (= :root-db (scheduler-sees)))))
       (is (= :root-db @db-handle))))))

(deftest ^:synchronized alter-root-inside-binding-test
  (do-with-scheduler
   (fn []
     (mc/alter-root db-handle :root-db)
     (mc/binding db-handle :bound-db
                 (fn []
                   (testing "alter-root returns the root it replaced, not the bound value"
                     (is (= :root-db (mc/alter-root db-handle :new-root-db))))
                   (testing "the binding still hides the new root on this thread"
                     (is (= :bound-db @db-handle)))
                   (testing "other threads see the new root at once"
                     (is (= :new-root-db (scheduler-sees))))))
     (testing "once the binding ends, this thread sees the new root too"
       (is (= :new-root-db @db-handle))))))

(deftest ^:synchronized nested-binding-test
  (mc/alter-root db-handle :root-db)
  (mc/binding db-handle :outer-db
              (fn []
                (mc/binding db-handle :inner-db
                            (fn []
                              (mc/reset! db-handle :inner-written-db)
                              (is (= :inner-written-db @db-handle))))
                (testing "the outer binding comes back, untouched by the inner write"
                  (is (= :outer-db @db-handle)))
                (testing "and comes back when the inner thunk throws"
                  (is (thrown? clojure.lang.ExceptionInfo
                               (mc/binding db-handle :inner-db
                                           (fn [] (throw (ex-info "boom" {}))))))
                  (is (= :outer-db @db-handle)))))
  (is (= :root-db @db-handle)))

(deftest ^:synchronized writes-to-another-component-test
  (testing "inside a binding of one component, writes to another go where that component lives"
    (do-with-scheduler
     (fn []
       (mc/alter-root db-handle :root-db)
       (mc/alter-root other-handle 41)
       (testing "an unbound component is written at its root, so the write outlives the binding"
         (mc/binding db-handle :bound-db
                     (fn []
                       (is (= 42 (mc/swap! other-handle inc)))
                       (is (= 42 (scheduler-runs (fn [] @other-handle))))))
         (is (= 42 @other-handle)))
       (testing "a component bound further out keeps the write after an inner binding ends"
         (mc/binding other-handle 0
                     (fn []
                       (mc/binding db-handle :bound-db
                                   (fn [] (mc/reset! other-handle 7)))
                       (is (= 7 @other-handle))
                       (is (= 42 (scheduler-runs (fn [] @other-handle)))))))
       (is (= 42 @other-handle))))))

(deftest ^:synchronized swap-returns-new-value-test
  (mc/alter-root other-handle {:n 1})
  (testing "at the root"
    (is (= {:n 2} (mc/swap! other-handle update :n inc)))
    (is (= {:n 2} @other-handle)))
  (testing "in a binding"
    (mc/binding other-handle {:n 10}
                (fn []
                  (is (= {:n 15} (mc/swap! other-handle update :n + 5)))
                  (is (= {:n 15} @other-handle)))))
  (is (= {:n 2} @other-handle)))

(deftest ^:synchronized binding-is-shared-with-conveyed-threads-test
  (testing "a future started inside a binding sees it, and its writes land in that binding"
    (mc/alter-root db-handle :root-db)
    (mc/binding db-handle :bound-db
                (fn []
                  (is (= :bound-db @(future @db-handle)))
                  @(future (mc/reset! db-handle :written-by-future))
                  (is (= :written-by-future @db-handle))))
    (is (= :root-db @db-handle))))

(deftest ^:synchronized without-binding-test
  (mc/alter-root db-handle :root-db)
  (mc/alter-root other-handle :root-other)
  (mc/binding db-handle :bound-db
              (fn []
                (mc/binding other-handle :bound-other
                            (fn []
                              (mc/without-binding db-handle
                                                  (fn []
                                                    (testing "the component reads its root"
                                                      (is (= :root-db @db-handle)))
                                                    (testing "other components keep their bindings"
                                                      (is (= :bound-other @other-handle)))
                                                    (mc/reset! db-handle :written-root-db)))
                              (testing "the binding is back afterwards, untouched by the write"
                                (is (= :bound-db @db-handle)))))))
  (testing "the write inside went to the root"
    (is (= :written-root-db @db-handle))))
