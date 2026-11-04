(ns metabase.global-system.system-test
  (:require
   [clojure.pprint :as pprint]
   [clojure.test :refer :all]
   [metabase.global-system.mutable-component :as mc]
   [metabase.global-system.system :as system]
   [metabase.global-system.test-util :as global-system.tu])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(def ^:private db-handle (system/mutable-component-handle ::db))
(def ^:private scheduler-handle (system/mutable-component-handle ::scheduler))
(def ^:private other-handle (system/mutable-component-handle ::other))

(defn- scheduler
  "A worker thread that runs thunks handed to it and returns their results.
   Running on a second thread is the only way to tell a root value from a thread-local one, since a thread-local
   binding is invisible from anywhere else."
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
  "Install a running scheduler as the `::scheduler` component for the duration of `thunk`, stopping it after."
  [thunk]
  (let [sched (scheduler)]
    (mc/alter-root scheduler-handle sched)
    (try (thunk)
         (finally ((:stop! sched))))))

(defn- global-setup!
  []
  (mc/alter-root db-handle :uninit-global-db)
  (mc/reset! db-handle :ready-global-db))

;;; ------------------------------------------------- Storage -------------------------------------------------

(deftest ^:synchronized dynamic-binding-test
  (do-with-scheduler
   (fn []
     (global-setup!)
     (is (= :ready-global-db @db-handle))
     (is (= :ready-global-db (scheduler-sees)))
     (testing "a dynamic binding is seen only from its dynamic scope"
       (mc/binding db-handle :uninit-dynamic-db
                   (fn dynamic-test-scope []
                     (is (= :uninit-dynamic-db @db-handle))
                     (is (= :ready-global-db (scheduler-sees)))
                     (mc/reset! db-handle :ready-dynamic-db)
                     (is (= :ready-dynamic-db @db-handle))
                     (is (= :ready-global-db (scheduler-sees))))))
     (testing "after the binding scope ends, the global value is restored"
       (is (= :ready-global-db @db-handle))
       (is (= :ready-global-db (scheduler-sees)))))))

(deftest ^:synchronized root-binding-test
  (do-with-scheduler
   (fn []
     (global-setup!)
     (is (= :ready-global-db @db-handle))
     (is (= :ready-global-db (scheduler-sees)))
     (testing "root binding changes are seen on all threads"
       (mc/alter-root db-handle :uninit-global-db)
       (is (= :uninit-global-db @db-handle))
       (is (= :uninit-global-db (scheduler-sees))))
     (testing "atom mutations on the root atom are seen on all threads"
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
      (is (= :root-db (::db snap)))
      (is (= :root-other (::other snap)))))
  (testing "a snapshot is a value, so later mutations cannot appear in one already taken"
    (let [snap (system/snapshot)]
      (mc/reset! other-handle :mutated-other)
      (is (= :root-other (::other snap)))
      (is (= :mutated-other (::other (system/snapshot))))))
  (testing "a snapshot agrees with dereferencing each handle, bound components included"
    (mc/binding db-handle :bound-db
                (fn []
                  (is (= :bound-db @db-handle))
                  (is (= :bound-db (::db (system/snapshot))))))))

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
                                   (is (= {::db    :written-db
                                           ::other 1}
                                          (select-keys (system/snapshot) [::db ::other]))))
                                 (testing "while another thread sees none of the writes"
                                   (is (= {::db    :root-db
                                           ::other :root-other}
                                          (scheduler-runs (fn [] (select-keys (system/snapshot) [::db ::other]))))))))))
     (testing "and the roots are untouched once the scope ends"
       (is (= :root-db @db-handle))
       (is (= :root-other @other-handle))))))

(deftest ^:synchronized unknown-component-test
  (let [never-set (system/mutable-component-handle ::never-set)
        no-value  #"Component has no value"]
    (testing "reading a component that was never given a value fails loudly rather than returning nil"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo no-value @never-set)))
    (testing "the error names the component and lists the ones that are installed"
      (mc/alter-root db-handle :root-db)
      (is (=? {:component  ::never-set
               :components #(some #{::db} %)}
              (try @never-set (catch clojure.lang.ExceptionInfo e (ex-data e))))))
    (testing "writes fail too, since only alter-root installs a component"
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

;;; ------------------------------------------------ Printing -------------------------------------------------

(deftest handle-prints-test
  (testing "a handle prints, even when its component was never installed"
    (is (= {:pr     "#<ComponentHandle :metabase.global-system.system-test/never-installed>"
            :pprint "#<ComponentHandle :metabase.global-system.system-test/never-installed>"}
           (let [handle (system/mutable-component-handle ::never-installed)]
             {:pr     (pr-str handle)
              :pprint (pprint/write handle :stream nil)})))))

;;; ---------------------------------------------- Atomic writes ----------------------------------------------

(deftest ^:synchronized swap-vals-test
  (mc/alter-root other-handle 1)
  (testing "swap-vals! and reset-vals! return the value before and after, at the root"
    (is (= [1 2] (mc/swap-vals! other-handle inc)))
    (is (= [2 5] (mc/reset-vals! other-handle 5))))
  (testing "and in a binding, leaving the root alone"
    (mc/binding other-handle 10
                (fn []
                  (is (= [10 11] (mc/swap-vals! other-handle inc)))
                  (is (= [11 0] (mc/reset-vals! other-handle 0))))))
  (is (= 5 @other-handle)))

;;; --------------------------------------- Roots, locks and test roots ---------------------------------------

(deftest ^:synchronized root-entry-test
  (let [handle (system/mutable-component-handle ::root-entry)]
    (testing "a component with no root has no root entry"
      (is (nil? (mc/root-entry handle))))
    (testing "a nil root is still a root"
      (mc/alter-root handle nil)
      (is (= [::root-entry nil] (mc/root-entry handle))))
    (testing "the root entry ignores a binding"
      (mc/binding handle :bound
                  (fn []
                    (is (= [::root-entry nil] (mc/root-entry handle))))))
    (testing "remove-root uninstalls the component, so reads and writes throw again"
      (mc/remove-root handle)
      (is (nil? (mc/root-entry handle)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Component has no value" @handle))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Component has no value" (mc/reset! handle 1))))))

(deftest ^:synchronized slot-lock-test
  (mc/alter-root db-handle :root-db)
  (let [root-lock (mc/slot-lock db-handle)]
    (testing "the root has one lock per component"
      (is (identical? root-lock (mc/slot-lock db-handle)))
      (is (not (identical? root-lock (mc/slot-lock other-handle)))))
    (testing "each binding has its own lock, shared with threads that inherit it"
      (mc/binding db-handle :bound-db
                  (fn []
                    (let [bound-lock (mc/slot-lock db-handle)]
                      (is (not (identical? root-lock bound-lock)))
                      (is (identical? bound-lock @(future (mc/slot-lock db-handle))))
                      (testing "and a nested binding has another"
                        (mc/binding db-handle :inner-db
                                    (fn []
                                      (is (not (identical? bound-lock (mc/slot-lock db-handle)))))))
                      (testing "without-binding gives the root's lock back"
                        (mc/without-binding db-handle
                                            (fn []
                                              (is (identical? root-lock (mc/slot-lock db-handle))))))))))
    (testing "with-slot-lock holds that lock for its body"
      (is (true? (mc/with-slot-lock db-handle
                   (Thread/holdsLock root-lock)))))))

(deftest ^:synchronized with-root-test
  (do-with-scheduler
   (fn []
     (testing "with-root installs a root that threads outside any binding see, then restores the one it replaced"
       (mc/alter-root db-handle :root-db)
       (global-system.tu/with-root db-handle :temp-root-db
         (is (= :temp-root-db (scheduler-sees))))
       (is (= :root-db @db-handle)))
     (testing "a component that had no root has none again afterwards"
       (let [handle (system/mutable-component-handle ::with-root-absent)]
         (global-system.tu/with-root handle :temp
           (is (= :temp (scheduler-runs (fn [] @handle)))))
         (is (nil? (mc/root-entry handle))))))))

(deftest ^:synchronized init-root-test
  (testing "init-root runs only when the component has no root"
    (let [calls  (atom 0)
          make   #(system/mutable-component-handle ::init-root (fn [] (swap! calls inc) :initial))
          handle (make)]
      (try
        (is (= :initial @handle))
        (mc/reset! handle :changed)
        (testing "so making the handle again, as a reload does, keeps the current root"
          (make)
          (is (= {:calls 1, :value :changed}
                 {:calls @calls, :value @handle})))
        (finally
          (mc/remove-root handle))))))

(deftest ^:synchronized writes-wait-for-slot-lock-test
  (testing "a write to a slot waits until a with-slot-lock section on that slot ends"
    (let [in-root    (fn [f] (f))
          in-binding (fn [f] (mc/binding db-handle :bound-db f))
          value      #(deref db-handle)
          root-entry #(mc/root-entry db-handle)]
      (doseq [[label run write read expected]
              ;; label             slot        write                                    read        expected
              [["root reset!"      in-root     #(mc/reset! db-handle :plain-write)      value       :plain-write]
               ["root alter-root"  in-root     #(mc/alter-root db-handle :plain-write)  value       :plain-write]
               ["root remove-root" in-root     #(mc/remove-root db-handle)              root-entry  nil]
               ["binding reset!"   in-binding  #(mc/reset! db-handle :plain-write)      value       :plain-write]]]
        (testing label
          (mc/alter-root db-handle :root-db)
          (run (fn []
                 (let [inside        (promise)
                       leave         (promise)
                       writer-thread (promise)
                       holder        (future (mc/with-slot-lock db-handle
                                               (deliver inside true)
                                               @leave
                                               (mc/reset! db-handle :checked-value)))
                       _             @inside
                       writer        (future (deliver writer-thread (Thread/currentThread))
                                             (write))]
                   (testing "the writer is blocked on the lock, not just slow to start"
                     (is (true? (loop [tries 0]
                                  (cond
                                    (= Thread$State/BLOCKED (.getState ^Thread @writer-thread)) true
                                    (< tries 400)                                              (do (Thread/sleep 5)
                                                                                                   (recur (inc tries)))
                                    :else                                                      false)))))
                   (deliver leave true)
                   @holder
                   @writer
                   (testing "the write lands after the section's own write"
                     (is (= expected (read)))))))))
      (mc/alter-root db-handle :root-db))))

(deftest ^:synchronized component-bound-fn-test
  (testing "a function made with component-bound-fn carries component bindings to another thread, and nothing else"
    (mc/alter-root db-handle :root-db)
    (let [seen (promise)]
      (binding [*print-length* 3]
        (mc/binding db-handle :bound-db
                    (fn []
                      (let [f      (system/component-bound-fn (fn [] [@db-handle *print-length*]))
                            thread (Thread. ^Runnable (fn [] (deliver seen (f))))]
                        (.start thread)
                        (.join thread)))))
      (is (= [:bound-db nil] @seen)))))

;;; ------------------------------------------------ Lifecycle ------------------------------------------------

(deftest ^:synchronized ensure-started-test
  (let [handle  (system/mutable-component-handle ::ensure-started (constantly nil))
        starts  (atom 0)
        stopped (atom [])
        start   (fn [] (swap! starts inc) (Object.))
        stop    #(swap! stopped conj %)]
    (try
      (testing "threads racing to start the component start it once"
        (let [go      (promise)
              racers  (mapv (fn [_] (future @go (system/ensure-started! handle start stop))) (range 16))
              _       (deliver go true)
              results (mapv deref racers)]
          (is (= {:starts 1, :distinct-values 1}
                 {:starts @starts, :distinct-values (count (into #{} (map System/identityHashCode) results))}))))
      (testing "a thread that binds the component gets the binding and starts nothing, nil included"
        (mc/binding handle :bound
                    (fn [] (is (= :bound (system/ensure-started! handle start stop)))))
        (mc/binding handle nil
                    (fn [] (is (nil? (system/ensure-started! handle start stop)))))
        (is (= 1 @starts)))
      (testing "stop! stops the running value once, and leaves the root nil"
        (let [running @handle]
          (is (true? (system/stop! handle)))
          (is (false? (system/stop! handle)))
          (is (= {:stopped [running], :value nil}
                 {:stopped @stopped, :value @handle}))))
      (testing "after a stop, the next ensure-started! starts it again"
        (is (some? (system/ensure-started! handle start stop)))
        (is (= 2 @starts)))
      (finally
        (system/stop! handle)
        (mc/remove-root handle)))))

(deftest ^:synchronized start-reports-whether-it-started-test
  (testing "start! says whether this call did the start, and later calls get the running value"
    (let [handle (system/mutable-component-handle ::start-reports (constantly nil))]
      (try
        (is (= {:first [:running true], :second [:running false]}
               {:first  (system/start! handle (constantly :running) (constantly nil))
                :second (system/start! handle (constantly :other) (constantly nil))}))
        (finally
          (system/stop! handle)
          (mc/remove-root handle))))))

(deftest ^:synchronized halt-order-test
  (testing "halt stops components in reverse start order, and one failing stop does not prevent the others"
    (let [stopped (atom [])
          stop    (fn [v] (swap! stopped conj v) (when (= v :b) (throw (ex-info "boom" {}))))
          handles [(system/mutable-component-handle ::halt-a (constantly nil))
                   (system/mutable-component-handle ::halt-b (constantly nil))
                   (system/mutable-component-handle ::halt-c (constantly nil))]]
      (try
        (doseq [[handle value] (map vector handles [:a :b :c])]
          (system/ensure-started! handle (constantly value) stop))
        (is (= {:failures [::halt-b]
                :stopped  [:c :b :a]
                :values   [nil nil nil]}
               {:failures (try (#'system/stop-all! (filter (set handles) (#'system/halt-order)))
                               []
                               (catch clojure.lang.ExceptionInfo e
                                 (mapv first (:failures (ex-data e)))))
                :stopped  @stopped
                :values   (mapv deref handles)}))
        (finally
          (doseq [handle handles]
            (system/stop! handle)
            (mc/remove-root handle)))))))

(deftest ^:synchronized start-returning-false-test
  (testing "a start that returns false still counts as started, so it runs once"
    (let [handle (system/mutable-component-handle ::starts-false (constantly nil))
          starts (atom 0)]
      (try
        (dotimes [_ 3]
          (system/ensure-started! handle #(do (swap! starts inc) false) (constantly nil)))
        (is (= 1 @starts))
        (finally
          (system/stop! handle)
          (mc/remove-root handle))))))

(deftest ^:synchronized start-returning-nil-test
  (testing "a start that returns nil throws, and leaves nothing registered"
    (let [handle (system/mutable-component-handle ::starts-nil (constantly nil))]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Starting component returned nil"
                              (system/ensure-started! handle (constantly nil) (constantly nil))))
        (is (false? (system/stop! handle)))
        (finally
          (mc/remove-root handle))))))

(deftest ^:synchronized stop-leaves-unmanaged-roots-test
  (testing "stop! leaves alone a root that ensure-started! did not start"
    (let [handle (system/mutable-component-handle ::unmanaged (constantly :installed))]
      (try
        (is (= {:stopped? false, :value :installed}
               {:stopped? (system/stop! handle), :value @handle}))
        (finally
          (mc/remove-root handle))))))

(deftest ^:synchronized stop-after-reload-test
  (testing "a handle made again for the same key, as a reload does, stops what the old handle started"
    (let [stopped (atom [])
          old     (system/mutable-component-handle ::reloaded (constantly nil))
          _       (system/ensure-started! old (constantly :running) #(swap! stopped conj %))
          new     (system/mutable-component-handle ::reloaded (constantly nil))]
      (try
        (is (= {:stopped? true, :stopped [:running]}
               {:stopped? (system/stop! new), :stopped @stopped}))
        (finally
          (system/stop! new)
          (mc/remove-root new))))))
