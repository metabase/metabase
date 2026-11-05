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

(defn- cleanup!
  "Stop each of `handles` and remove its root."
  [handles]
  (doseq [handle handles]
    (system/stop! handle)
    (mc/remove-root handle)))

(defn- halt-order
  "The handles [[system/halt!]] would stop, in order, given `dependencies`."
  ([]
   (halt-order {}))
  ([dependencies]
   (#'system/halt-order (#'system/dependency-graph dependencies))))

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
          (is (= {:starts 1, :one-value? true}
                 {:starts @starts, :one-value? (every? #(identical? (first results) %) results)}))))
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
        (cleanup! [handle])))))

(deftest ^:synchronized start-reports-whether-it-started-test
  (testing "start! says whether this call did the start, and later calls get the running value"
    (let [handle (system/mutable-component-handle ::start-reports (constantly nil))]
      (try
        (is (= {:first [:running true], :second [:running false]}
               {:first  (system/start! handle (constantly :running) (constantly nil))
                :second (system/start! handle (constantly :other) (constantly nil))}))
        (finally
          (cleanup! [handle]))))))

;; halt! is only called in these tests with dependencies it refuses: a halt stops every component this test JVM has
;; started, such as the test web server, which later tests need. It is only (dependency-graph), (begin-halt!) and
;; (stop-all! (halt-order)), and these tests drive each part on throwaway components, reopening afterwards, so a
;; regression in any of them fails here.
(deftest ^:synchronized halt-order-test
  (testing "halt stops components in reverse start order, and failing stops do not stop the rest and are all reported"
    (let [stopped (atom [])
          stop    (fn [v]
                    (swap! stopped conj v)
                    (when (#{:b :c} v)
                      (throw (ex-info (str "stop " (name v)) {}))))
          handles [(system/mutable-component-handle ::halt-a (constantly nil))
                   (system/mutable-component-handle ::halt-b (constantly nil))
                   (system/mutable-component-handle ::halt-c (constantly nil))]]
      (try
        (doseq [[handle value] (map vector handles [:a :b :c])]
          (system/ensure-started! handle (constantly value) stop))
        (is (= {:failures   [::halt-c ::halt-b]
                :cause      "stop c"
                :suppressed ["stop b"]
                :stopped    [:c :b :a]
                :values     [nil nil nil]}
               (merge (try (#'system/stop-all! (filter (set handles) (halt-order)))
                           {}
                           (catch clojure.lang.ExceptionInfo e
                             {:failures   (mapv first (:failures (ex-data e)))
                              :cause      (ex-message (ex-cause e))
                              :suppressed (mapv ex-message (.getSuppressed (ex-cause e)))}))
                      {:stopped @stopped
                       :values  (mapv deref handles)})))
        (finally
          (cleanup! handles))))))

(deftest ^:synchronized stops-sharing-an-exception-test
  (testing "two stops that throw the same exception are both reported, and the exception is not suppressed by itself"
    (let [shared  (ex-info "shared failure" {})
          a       (system/mutable-component-handle ::shares-a (constantly nil))
          b       (system/mutable-component-handle ::shares-b (constantly nil))
          handles [a b]]
      (try
        (doseq [handle handles]
          (system/ensure-started! handle (constantly :running) (fn [_] (throw shared))))
        (is (= {:failures [::shares-b ::shares-a], :cause "shared failure", :suppressed []}
               (try (#'system/stop-all! (filter (set handles) (halt-order)))
                    {}
                    (catch clojure.lang.ExceptionInfo e
                      {:failures   (mapv first (:failures (ex-data e)))
                       :cause      (ex-message (ex-cause e))
                       :suppressed (vec (.getSuppressed (ex-cause e)))}))))
        (finally
          (cleanup! handles))))))

(deftest ^:synchronized root-published-after-registration-test
  (testing "a started component's root becomes visible only once the component is registered"
    (let [handle     (system/mutable-component-handle ::published-after-registration (constantly nil))
          k          ::published-after-registration
          registered (atom ::never-published)
          roots      @#'system/roots]
      (add-watch roots ::published (fn [_ _ old new]
                                     (when (and (nil? (get old k)) (some? (get new k)))
                                       (reset! registered (contains? @@#'system/started-components k)))))
      (try
        (system/ensure-started! handle (constantly :running) (constantly nil))
        (is (true? @registered))
        (finally
          (remove-watch roots ::published)
          (cleanup! [handle]))))))

(deftest ^:synchronized halted-system-refuses-starts-test
  (testing "once a halt begins no component starts, until the system is reopened"
    (let [handle (system/mutable-component-handle ::after-halt (constantly nil))]
      (try
        (#'system/close-admission!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"The system has halted"
                              (system/ensure-started! handle (constantly :started) (constantly nil))))
        (system/reopen!)
        (is (= :started (system/ensure-started! handle (constantly :started) (constantly nil))))
        (finally
          (system/reopen!)
          (cleanup! [handle]))))))

(deftest ^:synchronized halt-waits-for-running-starts-test
  (testing "a halt waits for a start already running, so the halt order includes it"
    (let [handle (system/mutable-component-handle ::starting-during-halt (constantly nil))
          inside (promise)
          leave  (promise)]
      (try
        (let [starter (future (system/ensure-started! handle
                                                      #(do (deliver inside true) @leave :started)
                                                      (constantly nil)))
              _       @inside
              closing (future (#'system/begin-halt!))]
          (is (= ::still-waiting (deref closing 200 ::still-waiting)))
          (deliver leave true)
          @starter
          @closing
          (is (some #{handle} (halt-order))))
        (finally
          (system/reopen!)
          (cleanup! [handle]))))))

(deftest ^:synchronized halt-waits-without-holding-a-lock-test
  (testing "starts that hold a slot lock while a halt waits are refused at once, so nothing deadlocks"
    (let [a        (system/mutable-component-handle ::waits-a (constantly nil))
          b        (system/mutable-component-handle ::waits-b (constantly nil))
          c        (system/mutable-component-handle ::waits-c (constantly nil))
          go       (promise)
          outcome  (fn [thunk]
                     (try
                       (thunk)
                       :started
                       (catch clojure.lang.ExceptionInfo e
                         (ex-message e))))
          refusal  #(str "The system has halted, so a component cannot start: " %)
          wait-for (fn [ready?]
                     (loop [tries 0]
                       (cond
                         (ready?)      nil
                         (< tries 500) (do (Thread/sleep 10)
                                           (recur (inc tries)))
                         :else         (throw (ex-info "A thread never reached the state the test needs" {})))))
          start-a  (fn []
                     @go
                     (system/ensure-started! b (constantly :b) (constantly nil))
                     :a)
          ;; in flight while the halt begins, then starts b
          starter  (future (outcome #(system/ensure-started! a start-a (constantly nil))))
          halter   (doto (Thread. ^Runnable #(#'system/begin-halt!))
                     (.setDaemon true))]
      (try
        (wait-for #(contains? (:starting @@#'system/admissions) ::waits-a))
        (.start halter)
        (wait-for #(#{Thread$State/BLOCKED Thread$State/WAITING} (.getState halter)))
        ;; a start made while holding another component's slot lock
        (let [writer (future (mc/with-slot-lock b
                               (outcome #(system/ensure-started! c (constantly :c) (constantly nil)))))]
          (is (= (refusal ::waits-c)
                 (deref writer 5000 ::deadlocked))))
        (deliver go true)
        (.join halter 5000)
        (is (= {:starter (refusal ::waits-b), :halt-finished? true}
               {:starter        (deref starter 5000 ::deadlocked)
                :halt-finished? (not (.isAlive halter))}))
        (finally
          (deliver go true)
          (system/reopen!)
          (cleanup! [a b c]))))))

(deftest ^:synchronized halt-from-a-start-is-refused-test
  (testing "a halt called from a component's start throws, and leaves starts admitted"
    (let [halter (system/mutable-component-handle ::halts-in-start (constantly nil))
          other  (system/mutable-component-handle ::after-refused-halt (constantly nil))]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A component's start cannot halt the system"
                              (system/ensure-started! halter #(#'system/begin-halt!) (constantly nil))))
        (is (= :started (system/ensure-started! other (constantly :started) (constantly nil))))
        (finally
          (system/reopen!)
          (cleanup! [halter other]))))))

(deftest ^:synchronized start-returning-false-test
  (testing "a start that returns false still counts as started, so it runs once"
    (let [handle (system/mutable-component-handle ::starts-false (constantly nil))
          starts (atom 0)]
      (try
        (dotimes [_ 3]
          (system/ensure-started! handle #(do (swap! starts inc) false) (constantly nil)))
        (is (= 1 @starts))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized start-returning-nil-test
  (testing "a start that returns nil throws, and leaves nothing registered"
    (let [handle (system/mutable-component-handle ::starts-nil (constantly nil))]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Starting component returned nil"
                              (system/ensure-started! handle (constantly nil) (constantly nil))))
        (is (false? (system/stop! handle)))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized failed-start-can-be-retried-test
  (testing "a start that throws leaves nothing registered, and the next start succeeds"
    (let [handle (system/mutable-component-handle ::fails-then-starts (constantly nil))
          starts (atom 0)
          start  #(if (= 1 (swap! starts inc))
                    (throw (ex-info "first start fails" {}))
                    :started)]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"first start fails"
                              (system/ensure-started! handle start (constantly nil))))
        (is (= {:after-failure nil, :retry :started, :starts 2}
               {:after-failure @handle
                :retry         (system/ensure-started! handle start (constantly nil))
                :starts        @starts}))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized stop-leaves-unmanaged-roots-test
  (testing "stop! leaves alone a root that ensure-started! did not start"
    (let [handle (system/mutable-component-handle ::unmanaged (constantly :installed))]
      (try
        (is (= {:stopped? false, :value :installed}
               {:stopped? (system/stop! handle), :value @handle}))
        (finally
          (cleanup! [handle]))))))

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
          (cleanup! [new]))))))

(deftest ^:synchronized restart-keeps-halt-place-test
  (testing "a component restarted after its dependents still halts after them"
    (let [a (system/mutable-component-handle ::restart-a (constantly nil))
          b (system/mutable-component-handle ::restart-b (constantly nil))]
      (try
        (system/ensure-started! a (constantly :a) (constantly nil))
        (system/ensure-started! b (constantly :b) (constantly nil))
        (system/stop! a)
        (system/ensure-started! a (constantly :a-again) (constantly nil))
        (is (= [b a] (filter #{a b} (halt-order))))
        (finally
          (cleanup! [a b]))))))

(deftest ^:synchronized dependency-started-inside-start-halts-after-test
  (testing "a component started inside another's start comes first in the start order, so it halts after"
    (let [dep  (system/mutable-component-handle ::inner-dep (constantly nil))
          user (system/mutable-component-handle ::inner-user (constantly nil))]
      (try
        (system/ensure-started! user
                                #(do (system/ensure-started! dep (constantly :dep) (constantly nil)) :user)
                                (constantly nil))
        (is (= [user dep] (filter #{dep user} (halt-order))))
        (finally
          (cleanup! [user dep]))))))

(deftest ^:synchronized halt-order-follows-dependencies-test
  (testing "a component halts before the components it uses, even ones started after it, and the rest by start order"
    (let [a       (system/mutable-component-handle ::deps-a (constantly nil))
          b       (system/mutable-component-handle ::deps-b (constantly nil))
          c       (system/mutable-component-handle ::deps-c (constantly nil))
          handles [a b c]]
      (try
        (doseq [handle handles]
          (system/ensure-started! handle (constantly :running) (constantly nil)))
        (is (= {:no-dependencies   [c b a]
                :a-uses-c          [b a c]
                :a-uses-c-via-x    [b a c]
                :stopped-user-of-c [c b a]}
               {:no-dependencies   (filterv (set handles) (halt-order))
                :a-uses-c          (filterv (set handles) (halt-order {::deps-a #{::deps-c}}))
                :a-uses-c-via-x    (filterv (set handles) (halt-order {::deps-a        #{::never-started}
                                                                       ::never-started #{::deps-c}}))
                :stopped-user-of-c (filterv (set handles) (halt-order {::never-started #{::deps-c}}))}))
        (finally
          (cleanup! handles))))))

(deftest dependency-cycle-test
  (testing "dependencies that form a cycle are refused"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Circular dependency"
                          (#'system/dependency-graph {::cycle-a #{::cycle-b}, ::cycle-b #{::cycle-a}})))))

(deftest ^:synchronized halt-refuses-a-cycle-before-closing-admission-test
  (testing "a halt given a cycle throws while starts are still admitted"
    (let [handle (system/mutable-component-handle ::after-cyclic-halt (constantly nil))]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Circular dependency"
                              (system/halt! {::cycle-a #{::cycle-b}, ::cycle-b #{::cycle-a}})))
        (is (= :started (system/ensure-started! handle (constantly :started) (constantly nil))))
        (finally
          (system/reopen!)
          (cleanup! [handle]))))))

(deftest ^:synchronized start-ignores-bindings-test
  (testing "start sees roots, not the bindings of the thread that triggered it"
    (let [handle (system/mutable-component-handle ::start-unbound (constantly nil))]
      (mc/alter-root other-handle :root-other)
      (try
        (mc/binding other-handle :bound-other
                    (fn []
                      (system/ensure-started! handle (fn [] [:made-from @other-handle]) (constantly nil))))
        (is (= [:made-from :root-other] @handle))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized start-during-stop-throws-test
  (testing "a start while the stop function runs throws instead of deadlocking on the component's lock"
    (let [handle  (system/mutable-component-handle ::stopping (constantly nil))
          during  (atom nil)
          restart (fn []
                    (try (system/ensure-started! handle (constantly :again) (constantly nil))
                         (catch clojure.lang.ExceptionInfo e (ex-message e))))]
      (try
        (system/ensure-started! handle (constantly :running)
                                (fn [_] (reset! during (deref (future (restart)) 2000 ::deadlocked))))
        (system/stop! handle)
        (is (re-find #"Component is stopping" (str @during)))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized start-that-starts-itself-throws-test
  (testing "a start that starts its own component throws instead of recursing"
    (let [handle (system/mutable-component-handle ::self-start (constantly nil))
          start  (fn self [] (system/ensure-started! handle self (constantly nil)))]
      (try
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Starting component started itself"
                              (system/ensure-started! handle start (constantly nil))))
        (finally
          (cleanup! [handle]))))))

(deftest ^:synchronized stop-uses-current-value-test
  (testing "stop! stops the value the root holds now, which a running component may have replaced"
    (let [handle  (system/mutable-component-handle ::replaced (constantly nil))
          stopped (atom [])]
      (try
        (system/ensure-started! handle (constantly {:pools {}}) #(swap! stopped conj %))
        (mc/swap! handle assoc-in [:pools 1] :open-pool)
        (is (= {:stopped? true, :stopped [{:pools {1 :open-pool}}], :root nil}
               {:stopped? (system/stop! handle), :stopped @stopped, :root @handle}))
        (finally
          (cleanup! [handle]))))))

;;; ------------------------------------------- Derived components --------------------------------------------

(deftest ^:synchronized derived-component-test
  (mc/alter-root db-handle :root-db)
  (let [makes   (atom 0)
        derived (system/derived-component-handle ::derived [db-handle]
                                                 (fn [db] (swap! makes inc) {:for db, :id (Object.)}))]
    (testing "the same dependency value gives the same derived value"
      (is (identical? @derived @derived))
      (is (= 1 @makes)))
    (testing "a binding of the dependency gets its own value, and the root's is still there after"
      (let [root-value @derived]
        (mc/binding db-handle :bound-db
                    (fn [] (is (= :bound-db (:for @derived)))))
        (is (identical? root-value @derived))))
    (testing "a write that replaces the dependency's value gets a fresh derived value"
      (mc/reset! db-handle :replaced-db)
      (is (= :replaced-db (:for @derived))))
    (testing "dependency values are told apart by identity, not equality"
      (mc/reset! db-handle (String. "same"))
      (let [first-value @derived]
        (mc/reset! db-handle (String. "same"))
        (is (not (identical? first-value @derived)))))
    (testing "a value is remembered for as long as its dependency value is in use, however many others are made"
      (let [oldest (mc/binding db-handle :oldest (fn [] @derived))]
        (doseq [i (range 20)]
          (mc/binding db-handle i (fn [] @derived)))
        (is (identical? oldest (mc/binding db-handle :oldest (fn [] @derived))))))
    (testing "threads racing on a new dependency value all get one derived value"
      (mc/reset! db-handle :raced)
      (let [go      (promise)
            racers  (mapv (fn [_] (future @go @derived)) (range 16))
            _       (deliver go true)
            results (mapv deref racers)]
        (is (every? #(identical? (first results) %) results))))))

(deftest ^:synchronized derived-nil-value-test
  (testing "a derived value of nil is remembered like any other, so it is made once"
    (mc/alter-root db-handle :root-db)
    (let [makes   (atom 0)
          derived (system/derived-component-handle ::derived-nil [db-handle] (fn [_] (swap! makes inc) nil))]
      (is (= {:values [nil nil nil], :makes 1}
             {:values [@derived @derived @derived], :makes @makes})))))

(deftest ^:synchronized derived-drops-collected-values-test
  (testing "an entry whose dependency value was collected is dropped when a new entry is added"
    (mc/alter-root db-handle :root-db)
    (let [collected (doto (java.lang.ref.WeakReference. (Object.)) .clear)
          live      (Object.)
          entries   [[[collected] :made-for-collected]
                     [[(#'system/weak live)] :made-for-live]]]
      (is (= [:made-for-new :made-for-live]
             (mapv second (#'system/add-entry entries (constantly :made-for-new) [:new-dep])))))))

(deftest ^:synchronized collected-reference-matches-nothing-test
  (testing "an entry whose dependency value was collected does not match a dependency that is now nil"
    (let [collected (doto (java.lang.ref.WeakReference. (Object.)) .clear)]
      (is (false? (#'system/made-for? [[collected] :old-value] [nil]))))))
