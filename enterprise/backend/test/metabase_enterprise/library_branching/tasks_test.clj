(ns metabase-enterprise.library-branching.tasks-test
  "The task lifecycle: start, the one-task rule, supersede, cancel, the fence, the commit point, progress, the worker,
  boot and shutdown. The TaskLease traces of the formal model are scenarios here, with the base row of the app DB.
  The task functions commit their rows, so these tests are not parallel."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.init :as init]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.app-db :as app-db]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase-enterprise.library-branching.tasks-test-util :as tu]
   [metabase.startup.core :as startup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private b0 "0000000000000000000000000000000000000000")
(def ^:private c1 "1111111111111111111111111111111111111111")
(def ^:private h1 "2222222222222222222222222222222222222222")

(defn- inst [] (app-db/app-db-instance))

(defn- base [] (instance/base (inst)))

(defn- set-base! [expected new]
  (instance/set-base! (inst) expected new {}))

(defn- status [task] (:status (tasks/task (:id task))))

;;; ------------------------------------------------- One task at a time ---------------------------------------------

(deftest second-task-is-refused-while-one-runs-test
  (testing "a task that runs refuses the start of a second task, with the running-task message"
    (tu/with-no-tasks
      (let [running (tasks/start! "pull" (mt/user->id :crowberto))
            e       (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Library branching task in progress"
                                          (tasks/start! "push" nil)))]
        (is (= 400 (:status-code (ex-data e))))
        (is (= (:id running) (:id (:task (ex-data e)))))
        (is (= (:id running) (:id (tasks/live-task))))
        (testing "a committing push also holds the one-task rule"
          (tasks/cancel! (:id running))
          (let [push (tasks/start! "push" nil)]
            (is (= :ok (tasks/mark-committing! (:id push))))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Library branching task in progress"
                                  (tasks/start! "pull" nil)))))))))

(deftest stale-task-does-not-block-a-start-test
  (testing "a task with no sign of life for longer than the time limit does not block a new task: the start ends it"
    (tu/with-no-tasks
      (let [stale (tasks/start! "pull" nil)]
        (tu/pause! (:id stale))
        (is (nil? (tasks/live-task)))
        (let [new-task (tasks/start! "push" nil)]
          (is (= "running" (status new-task)))
          (is (= "interrupted" (status stale)))
          (is (some? (:ended_at (tasks/task (:id stale)))))
          (is (= (:id new-task) (:id (tasks/live-task)))))))))

(deftest supersede-ends-only-stale-tasks-test
  (testing "supersede ends each stale open task as interrupted, with the time limit in the message; a task with a
            fresh heartbeat stays open"
    (mt/with-temporary-setting-values [remote-sync-task-time-limit-ms (* 2 60 1000)]
      (tu/with-no-tasks
        (let [stale (tasks/start! "push" nil)
              _     (tasks/mark-committing! (:id stale))
              _     (tu/pause! (:id stale))
              fresh (tasks/start! "pull" nil)]
          (testing "the start of `fresh` already ended `stale`"
            (is (= "interrupted" (status stale))))
          (is (= "Sync was interrupted: the server stopped responding for 2 minutes (it may have restarted)"
                 (:error_message (tasks/task (:id stale)))))
          (is (= [] (tasks/supersede-stale!)))
          (is (= "running" (status fresh)))
          (tu/pause! (:id fresh))
          (is (= [(:id fresh)] (tasks/supersede-stale!)))
          (is (= "interrupted" (status fresh)))
          (testing "an ended task stays as it is"
            (is (= [] (tasks/supersede-stale!)))
            (is (= "Sync was interrupted: the server stopped responding for 2 minutes (it may have restarted)"
                   (:error_message (tasks/task (:id stale)))))))))))

(deftest heartbeat-keeps-a-task-live-test
  (testing "a heartbeat makes a paused task fresh again, and writes nothing on an ended task"
    (tu/with-no-tasks
      (let [task (tasks/start! "pull" nil)]
        (tu/pause! (:id task))
        (is (tasks/stale? (tasks/task (:id task))))
        (is (true? (tasks/heartbeat! (:id task))))
        (is (not (tasks/stale? (tasks/task (:id task)))))
        (is (= (:id task) (:id (tasks/live-task))))
        (tasks/cancel! (:id task))
        (tu/pause! (:id task))
        (is (false? (tasks/heartbeat! (:id task))))
        (is (= "cancelled" (status task)))))))

(deftest heartbeat-thread-beats-until-stopped-test
  (testing "the heartbeat thread calls its beat at each interval until it is stopped"
    (let [beats (atom 0)
          third (promise)
          stop! (tasks/start-heartbeat! 1 1 (fn []
                                              (when (= 3 (swap! beats inc))
                                                (deliver third true))))]
      (is (true? (deref third 10000 false)))
      (stop!)
      (testing "a throw of the beat does not stop the beats"
        (let [n     (atom 0)
              again (promise)
              stop! (tasks/start-heartbeat! 1 1 (fn []
                                                  (when (= 2 (swap! n inc))
                                                    (deliver again true))
                                                  (throw (ex-info "the app DB is down" {}))))]
          (is (true? (deref again 10000 false)))
          (stop!))))))

;;; ------------------------------------------------------ Cancel ----------------------------------------------------

(deftest cancel-is-a-compare-and-swap-of-a-running-task-test
  (tu/with-no-tasks
    (testing "a running task: the cancel ends it as cancelled"
      (let [task (tasks/start! "pull" (mt/user->id :rasta))
            {:keys [ok]} (tasks/cancel! (:id task))]
        (is (= "cancelled" (:status ok)))
        (is (= "Task cancelled" (:error_message ok)))
        (is (some? (:ended_at ok)))
        (is (= {:id (mt/user->id :rasta) :first_name "Rasta" :last_name "Toucan" :email "rasta@metabase.com"}
               (:initiated_by_user ok)))
        (testing "an ended task: the cancel is refused, and changes nothing"
          (is (= {:refused "cancelled"} (tasks/cancel! (:id task)))))))
    (testing "a successful task: the cancel is refused as too late"
      (let [task (tasks/start! "pull" nil)]
        (tasks/commit! (:id task) (fn [] {:ok true :outcome {:kind "pulled" :count 1 :branch "main"}}))
        (is (= {:refused "successful"} (tasks/cancel! (:id task))))
        (is (= "successful" (status task)))))
    (testing "no task with the id"
      (is (= {:refused nil} (tasks/cancel! Integer/MAX_VALUE))))))

;;; ------------------------------------------- TaskLease: the fence (nofence) ---------------------------------------

(deftest cancel-then-apply-is-fenced-test
  (testing "TaskLease nofence: a pull starts, an admin cancels it, then the apply runs: the apply refuses, the task
            stays cancelled, and the base does not move"
    (tu/with-no-tasks
      (set-base! nil b0)
      (let [pull    (tasks/start! "pull" nil)
            called? (atom false)]
        (tasks/cancel! (:id pull))
        (is (= {:fenced "cancelled"}
               (tasks/commit! (:id pull) (fn []
                                           (reset! called? true)
                                           (set-base! b0 h1)
                                           {:ok true}))))
        (is (false? @called?))
        (is (= b0 (base)))
        (is (= "cancelled" (status pull)))
        (testing "the worker's result after the fence does not change the task"
          (is (false? (tasks/fail! (:id pull) "fenced")))
          (is (false? (tasks/succeed! (:id pull) {:kind "pulled"})))
          (is (= "cancelled" (status pull))))))))

(deftest superseded-pull-is-fenced-test
  (testing "a pull whose worker paused past the time limit is superseded; when it wakes up, its apply refuses"
    (tu/with-no-tasks
      (set-base! nil b0)
      (let [pull (tasks/start! "pull" nil)]
        (tu/pause! (:id pull))
        (tasks/supersede-stale!)
        (is (= {:fenced "interrupted"} (tasks/commit! (:id pull) (fn [] (set-base! b0 h1) {:ok true}))))
        (is (= b0 (base)))
        (is (= "interrupted" (status pull)))))))

(deftest commit-ends-the-task-in-its-transaction-test
  (tu/with-no-tasks
    (set-base! nil b0)
    (testing "an :ok result commits the writes and ends the task as successful with the outcome"
      (let [pull (tasks/start! "pull" nil)]
        (is (= {:ok :done :outcome {:kind "pulled" :count 2 :branch "feature"}}
               (tasks/commit! (:id pull) (fn []
                                           (set-base! b0 h1)
                                           {:ok :done :outcome {:kind "pulled" :count 2 :branch "feature"}}))))
        (is (= h1 (base)))
        (is (= {:status "successful" :outcome {:kind "pulled" :count 2 :branch "feature"} :progress 1.0}
               (select-keys (tasks/task (:id pull)) [:status :outcome :progress])))))
    (testing "any other result rolls the writes back, and the task stays running"
      (let [pull (tasks/start! "pull" nil)]
        (is (= {:stale #{"x"}} (tasks/commit! (:id pull) (fn [] (set-base! h1 c1) {:stale #{"x"}}))))
        (is (= h1 (base)))
        (is (= "running" (status pull)))
        (testing "a throw rolls the writes back and propagates"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"the apply broke"
                                (tasks/commit! (:id pull) (fn []
                                                            (set-base! h1 c1)
                                                            (throw (ex-info "the apply broke" {}))))))
          (is (= h1 (base)))
          (is (= "running" (status pull))))
        (tasks/cancel! (:id pull))))
    (testing "the fence needs a transaction"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"needs an open transaction" (tasks/fence 1))))))

(deftest cancel-and-commit-are-ordered-by-the-row-lock-test
  (testing "a cancel while the apply transaction holds the row waits for it, then is refused: the task is
            successful, and its effect landed"
    (tu/with-no-tasks
      (set-base! nil b0)
      (let [pull    (tasks/start! "pull" nil)
            locked  (promise)
            release (promise)
            apply   (future (tasks/commit! (:id pull) (fn []
                                                        (deliver locked true)
                                                        @release
                                                        (set-base! b0 h1)
                                                        {:ok true})))
            _       (is (true? (deref locked 10000 false)))
            cancel  (future (tasks/cancel! (:id pull)))]
        (deliver release true)
        (is (= {:ok true} (deref apply 10000 ::timeout)))
        (is (= {:refused "successful"} (deref cancel 10000 ::timeout)))
        (is (= "successful" (status pull)))
        (is (= h1 (base)))))))

;;; ---------------------------------------- TaskLease: the commit point (nocommitpoint) ----------------------------

(deftest cancel-before-the-commit-point-stops-the-push-test
  (testing "TaskLease nocommitpoint, first half: a push reads, an admin cancels it; the push cannot pass its commit
            point, so it never reaches the remote compare-and-swap"
    (tu/with-no-tasks
      (let [push (tasks/start! "push" nil)]
        (tasks/cancel! (:id push))
        (is (= {:fenced "cancelled"} (tasks/mark-committing! (:id push))))
        (is (= "cancelled" (status push)))))))

(deftest cancel-after-the-commit-point-is-refused-test
  (testing "TaskLease nocommitpoint, second half: a cancel of a committing push is refused, and the push records its
            base and ends as successful"
    (tu/with-no-tasks
      (set-base! nil b0)
      (let [push (tasks/start! "push" nil)]
        (is (= :ok (tasks/mark-committing! (:id push))))
        (is (= {:refused "committing"} (tasks/cancel! (:id push))))
        (is (= :ok (tasks/record! (:id push) (fn [] (set-base! b0 c1)))))
        (is (= c1 (base)))
        (is (= "successful" (status push)))))))

(deftest failure-after-the-commit-point-is-an-interruption-test
  (testing "a push that fails after its commit point may have landed, so it ends as interrupted, never as failed"
    (tu/with-no-tasks
      (let [push (tasks/start! "push" nil)]
        (tasks/mark-committing! (:id push))
        (is (true? (tasks/fail! (:id push) "the app DB went away")))
        (is (= {:status "interrupted" :error_message "the app DB went away"}
               (select-keys (tasks/task (:id push)) [:status :error_message])))))))

;;; ------------------------------------------ TaskLease: the base compare-and-swap (nocas) -------------------------

(deftest stale-pull-cannot-move-the-base-back-test
  (testing "TaskLease nocas: a push marks its row and pauses; a reader supersedes it; a pull starts and plans at the
            old base; the push wakes up, lands and records its commit; the apply of the pull then cannot move the
            base back"
    (tu/with-no-tasks
      (set-base! nil b0)
      (let [push (tasks/start! "push" nil)]
        (is (= :ok (tasks/mark-committing! (:id push))))
        (tu/pause! (:id push))
        (let [pull (tasks/start! "pull" nil)]
          (is (= "interrupted" (status push)))
          ;; the push wakes up: its remote compare-and-swap landed, and it records the base from the base it read
          (is (= :ok (tasks/record! (:id push) (fn [] (set-base! b0 c1)))))
          (is (= c1 (base)))
          (testing "the record does not change the interrupted row: an interrupted push may have landed"
            (is (= "interrupted" (status push))))
          (testing "the pull planned against b0, so its apply refuses and writes nothing"
            (is (= {:moved c1} (tasks/commit! (:id pull) (fn []
                                                           (let [r (set-base! b0 b0)]
                                                             (if (= :ok r) {:ok true} r))))))
            (is (= c1 (base)))
            (is (= "running" (status pull)))
            (is (true? (tasks/fail! (:id pull) "The base moved")))
            (is (= "failed" (status pull)))))))))

;;; ----------------------------------------------------- Progress ---------------------------------------------------

(deftest progress-is-monotonic-and-throttled-test
  (testing "the reporter writes a fraction that never moves back, at most once per throttle window, and every
            forced checkpoint, with a frozen clock"
    (let [written (atom [])
          clock   (atom 0)
          report  (tasks/progress-reporter 1 {:throttle-ms 1000
                                              :now-fn      #(deref clock)
                                              :write-fn    #(swap! written conj %)})]
      (report 0.1)
      (report 0.2)                      ; inside the window: no write
      (report 0.3 {:force? true})       ; a checkpoint
      (report 0.25 {:force? true})      ; back: no write
      (swap! clock + 1000)
      (report 0.4)
      (report 2.0 {:force? true})       ; clamped
      (report -1 {:force? true})
      (is (= [0.1 0.3 0.4 1.0] @written)))))

(deftest progress-checkpoints-in-order-test
  (testing "a task body that passes fixed checkpoints, with a frozen clock, writes only the checkpoints, in order"
    (tu/with-no-tasks
      (let [task    (tasks/start! "pull" nil)
            written (atom [])
            report  (tasks/progress-reporter (:id task) {:now-fn   (constantly 0)
                                                         :write-fn (fn [f]
                                                                     (swap! written conj f)
                                                                     (tasks/report-progress! (:id task) f))})]
        (report 0.1 {:force? true})
        (doseq [f [0.15 0.2 0.25]] (report f))
        (report 0.33 {:force? true})
        (report 0.9 {:force? true})
        (is (= [0.1 0.33 0.9] @written))
        ;; the column is a float, so MySQL and MariaDB store the fraction with single precision
        (is (< (abs (- 0.9 (:progress (tasks/task (:id task))))) 1e-6))))))

(deftest progress-on-an-ended-task-stops-the-worker-test
  (testing "a report on a cancelled task throws, so the worker stops at that step; the row stays cancelled"
    (tu/with-no-tasks
      (let [task (tasks/start! "pull" nil)]
        (tasks/report-progress! (:id task) 0.5)
        (tasks/cancel! (:id task))
        (let [e (is (thrown? clojure.lang.ExceptionInfo (tasks/report-progress! (:id task) 0.6)))]
          (is (= {:type ::tasks/stopped :status "cancelled"} (select-keys (ex-data e) [:type :status]))))
        (is (= {:status "cancelled" :progress 0.5} (select-keys (tasks/task (:id task)) [:status :progress])))))))

(deftest phase-maps-its-steps-into-its-band-test
  (testing "a phase reports inside its band, never back, and reports its start in a phase with no total"
    (let [reported (atom [])
          step     (tasks/phase #(swap! reported conj %) 0.8 0.99)]
      (step 5 nil)
      (step 3 0)
      (step 0 100)
      (step 50 100)
      (step 100 100)
      (step 150 100)
      (is (= 0.8 (first @reported)))
      (is (every? #(<= 0.8 % 0.99) @reported))
      (is (apply <= @reported))
      (is (< 0.98 (last @reported))))))

;;; ------------------------------------------------------ Worker ----------------------------------------------------

(deftest worker-records-a-successful-result-test
  (testing "the worker is registered while it runs, the task ends with its outcome, and the success hook runs"
    (tu/with-no-tasks
      (let [task     (tasks/start! "pull" nil)
            seen     (atom nil)
            hook     (atom nil)
            outcome  {:kind "pulled" :count 3 :branch "feature"}
            ended    (tasks/run-task! (:id task)
                                      (fn [id]
                                        (reset! seen (contains? (tasks/running-task-ids) id))
                                        {:outcome outcome})
                                      :on-success (fn [id result] (reset! hook [id result])))]
        (is (true? @seen))
        (is (not (contains? (tasks/running-task-ids) (:id task))))
        (is (= {:status "successful" :outcome outcome} (select-keys ended [:status :outcome])))
        (is (= [(:id task) {:outcome outcome}] @hook))))))

(deftest worker-records-a-failure-test
  (tu/with-no-tasks
    (testing "a body that throws an Error ends the task as failed with its message"
      (let [task (tasks/start! "pull" nil)]
        (is (= {:status "failed" :error_message "the disk is full"}
               (select-keys (tasks/run-task! (:id task) (fn [_] (throw (Error. "the disk is full"))))
                            [:status :error_message])))
        (is (not (contains? (tasks/running-task-ids) (:id task))))))
    (testing "a throwable with no message gives its class name"
      (let [task (tasks/start! "pull" nil)]
        (is (= "java.lang.NullPointerException"
               (:error_message (tasks/run-task! (:id task) (fn [_] (throw (NullPointerException.)))))))))
    (testing "an :error result ends the task as failed with it"
      (let [task (tasks/start! "push" nil)]
        (is (= {:status "failed" :error_message "The remote moved" :outcome nil}
               (select-keys (tasks/run-task! (:id task) (fn [_] {:error "The remote moved"}))
                            [:status :error_message :outcome])))))
    (testing "an :error result with an outcome ends the task as failed with both: the outcome tells why"
      (let [task    (tasks/start! "pull" nil)
            outcome {:kind "conflicts" :branch "main" :conflicts [{:id "a" :kind "metric" :ours "updated"}]}]
        (is (= {:status "failed" :error_message "The pull has 1 conflict" :outcome outcome}
               (select-keys (tasks/run-task! (:id task) (fn [_] {:error "The pull has 1 conflict" :outcome outcome}))
                            [:status :error_message :outcome])))))
    (testing "a failure past the commit point keeps the outcome too"
      (let [push    (tasks/start! "push" nil)
            outcome {:kind "remote-moved"}]
        (tasks/mark-committing! (:id push))
        (is (true? (tasks/fail! (:id push) "The remote moved" outcome)))
        (is (= {:status "interrupted" :error_message "The remote moved" :outcome outcome}
               (select-keys (tasks/task (:id push)) [:status :error_message :outcome])))))))

(deftest worker-ends-the-task-when-the-bookkeeping-throws-test
  (testing "when recording the result throws, the task still ends, with the no-result message"
    (tu/with-no-tasks
      (let [task  (tasks/start! "pull" nil)
            calls (atom 0)
            real  (dynamic-redefs/original-fn #'tasks/succeed!)]
        (mt/with-dynamic-fn-redefs [tasks/succeed! (fn [id outcome]
                                                     (if (= 1 (swap! calls inc))
                                                       (throw (ex-info "the app DB hiccuped" {}))
                                                       (real id outcome)))]
          (is (= {:status "failed" :error_message "Task ended without recording a result"}
                 (select-keys (tasks/run-task! (:id task) (fn [_] {:outcome {:kind "pulled"}}))
                              [:status :error_message]))))))))

(deftest worker-does-not-overwrite-a-cancel-test
  (testing "a cancel during the body stays: the body's success does not change the cancelled task"
    (tu/with-no-tasks
      (let [task (tasks/start! "pull" nil)
            hook (atom false)]
        (is (= {:status "cancelled" :error_message "Task cancelled"}
               (select-keys (tasks/run-task! (:id task)
                                             (fn [id]
                                               (tasks/cancel! id)
                                               {:outcome {:kind "pulled"}})
                                             :on-success (fn [_ _] (reset! hook true)))
                            [:status :error_message])))
        (is (false? @hook))))))

(deftest worker-stops-the-heartbeat-on-exit-test
  (testing "the heartbeat stops on every exit of the worker"
    (tu/with-no-tasks
      (doseq [body [(fn [_] {:outcome {:kind "pulled"}})
                    (fn [_] {:error "no"})
                    (fn [_] (throw (Exception. "boom")))]]
        (let [task    (tasks/start! "pull" nil)
              started (atom [])
              stopped (atom [])
              real    (dynamic-redefs/original-fn #'tasks/start-heartbeat!)]
          (mt/with-dynamic-fn-redefs [tasks/start-heartbeat! (fn [id interval]
                                                               (swap! started conj id)
                                                               (let [stop! (real id interval #(tasks/heartbeat! id))]
                                                                 (fn []
                                                                   (swap! stopped conj id)
                                                                   (stop!))))]
            (tasks/run-task! (:id task) body))
          (is (= [(:id task)] @started @stopped)))))))

(deftest success-hook-failure-does-not-fail-the-task-test
  (testing "a success hook that throws (the audit log is down) leaves the task successful"
    (tu/with-no-tasks
      (let [task (tasks/start! "push" nil)]
        (is (= "successful"
               (:status (tasks/run-task! (:id task)
                                         (fn [_] {:outcome {:kind "pushed" :count 1 :branch "main"}})
                                         :on-success (fn [_ _] (throw (ex-info "the audit log is down" {})))))))))))

(deftest submit-runs-the-worker-in-the-background-test
  (testing "submit starts the task, returns it at once, and runs the worker on another thread"
    (tu/with-no-tasks
      (let [release (promise)
            done    (promise)
            task    (tasks/submit! "pull" nil
                                   (fn [_] @release {:outcome {:kind "pulled" :count 0 :branch "main"}})
                                   :on-success (fn [_ _] (deliver done true)))]
        (is (= "running" (:status task)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Library branching task in progress"
                              (tasks/submit! "push" nil (fn [_] {:outcome {:kind "pushed"}}))))
        (deliver release true)
        (is (true? (deref done 10000 false)))
        (is (= "successful" (status task)))))))

(deftest submit-stops-a-worker-past-the-hard-time-limit-test
  (testing "a worker that runs for longer than the hard time limit is stopped, and its task fails with a message"
    (tu/with-no-tasks
      (let [stopped (promise)
            task    (tasks/submit! "pull" nil
                                   (fn [_]
                                     (try
                                       @(promise)
                                       (finally
                                         (deliver stopped true))))
                                   :timeout-ms 200)]
        (is (true? (deref stopped 10000 false)) "the worker is interrupted")
        (is (=? {:status "failed" :error_message "Task stopped: it ran for longer than its time limit of 200.0 ms"}
                (tasks/task (:id task))))))))

(deftest default-hard-time-limit-test
  (testing "the hard time limit of a worker is ten times the time limit of a heartbeat"
    (mt/with-temporary-setting-values [remote-sync-task-time-limit-ms 1000]
      (is (= 10000 (tasks/hard-time-limit-ms))))))

;;; -------------------------------------------------- Boot and shutdown ---------------------------------------------

(deftest shutdown-interrupts-the-tasks-of-this-jvm-test
  (testing "the shutdown ends the tasks whose worker runs in this JVM; a late result does not overwrite the
            interrupted task"
    (tu/with-no-tasks
      (let [mine    (tasks/start! "push" nil)
            inside  (promise)
            release (promise)
            worker  (future (tasks/run-task! (:id mine) (fn [_]
                                                          (deliver inside true)
                                                          @release
                                                          {:outcome {:kind "pushed" :count 1 :branch "main"}})))]
        (is (true? (deref inside 10000 false)))
        ((get-method startup/def-shutdown-logic! ::init/interrupt-running-tasks) nil)
        (is (= {:status "interrupted" :error_message "Interrupted by server shutdown"}
               (select-keys (tasks/task (:id mine)) [:status :error_message])))
        (deliver release true)
        (is (= "interrupted" (:status (deref worker 10000 ::timeout))))))))

(deftest shutdown-leaves-an-open-row-of-another-jvm-test
  (testing "an open row whose worker is not in this JVM stays open at shutdown"
    (tu/with-no-tasks
      (let [other (tasks/start! "pull" nil)]
        ((get-method startup/def-shutdown-logic! ::init/interrupt-running-tasks) nil)
        (is (= "running" (status other)))
        (tasks/cancel! (:id other))))))

(deftest boot-supersedes-stale-tasks-test
  (testing "the boot ends a stale open task as interrupted, and leaves a fresh open task open"
    (tu/with-no-tasks
      (let [stale (tasks/start! "pull" nil)]
        (tu/pause! (:id stale))
        (let [fresh (tasks/start! "push" nil)]
          ;; make `stale` open again, as a row that a crashed JVM left
          (t2/query {:update :library_branching_task :set {:status "running" :ended_at nil}
                     :where [:= :id (:id stale)]})
          ((get-method startup/def-startup-logic! ::init/supersede-stale-tasks) nil)
          (is (= "interrupted" (status stale)))
          (is (re-find #"^Sync was interrupted" (:error_message (tasks/task (:id stale)))))
          (is (= "running" (status fresh))))))))
