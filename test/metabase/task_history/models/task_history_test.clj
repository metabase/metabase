(ns metabase.task-history.models.task-history-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.task-history.models.task-history :as task-history]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Clock Instant ZoneId)))

(set! *warn-on-reflection* true)

(defn add-second
  "Adds one second to `t`"
  [t]
  (t/plus t (t/seconds 1)))

(defn add-10-millis
  "Adds 10 milliseconds to `t`"
  [t]
  (t/plus t (t/millis 10)))

(defn make-10-millis-task
  "Creates a map suitable for a `with-temp*` call for `TaskHistory`. Uses the `started_at` param sets the `ended_at`
  to 10 milliseconds later"
  [started-at]
  (let [ended-at (add-10-millis started-at)]
    {:started_at started-at
     :ended_at   ended-at
     :duration   (.between java.time.temporal.ChronoUnit/MILLIS started-at ended-at)}))

(deftest cleanup-test
  (testing "Basic cleanup test where older rows are deleted and newer rows kept"
    (let [task-4   (mt/random-name)
          task-5   (mt/random-name)
          t1-start (t/zoned-date-time)
          t2-start (add-second t1-start)
          t3-start (add-second t2-start)
          t4-start (add-second t3-start)
          t5-start (add-second t4-start)]
      (mt/with-temp [:model/TaskHistory t1 (make-10-millis-task t1-start)
                     :model/TaskHistory t2 (make-10-millis-task t2-start)
                     :model/TaskHistory t3 (make-10-millis-task t3-start)
                     :model/TaskHistory t4 (assoc (make-10-millis-task t4-start)
                                                  :task task-4)
                     :model/TaskHistory t5 (assoc (make-10-millis-task t5-start)
                                                  :task task-5)]
        ;; When the sync process runs, it creates several TaskHistory rows. We just want to work with the
        ;; temp ones created, so delete any stale ones from previous tests
        (t2/delete! :model/TaskHistory :id [:not-in (map u/the-id [t1 t2 t3 t4 t5])])
        ;; Delete all but 2 task history rows
        (task-history/cleanup-task-history! 2)
        (is (= #{task-4 task-5}
               (set (map :task (t2/select :model/TaskHistory)))))))))

(deftest no-op-test
  (testing "Basic cleanup test where no work needs to be done and nothing is deleted"
    (let [task-1   (mt/random-name)
          task-2   (mt/random-name)
          t1-start (t/zoned-date-time)
          t2-start (add-second t1-start)]
      (mt/with-temp [:model/TaskHistory t1 (assoc (make-10-millis-task t1-start)
                                                  :task task-1)
                     :model/TaskHistory t2 (assoc (make-10-millis-task t2-start)
                                                  :task task-2)]
        ;; Cleanup any stale TalkHistory entries that are not the two being tested
        (t2/delete! :model/TaskHistory :id [:not-in (map u/the-id [t1 t2])])
        ;; We're keeping 100 rows, but there are only 2 present, so there should be no affect on running this
        (is (= #{task-1 task-2}
               (set (map :task (t2/select :model/TaskHistory)))))
        (task-history/cleanup-task-history! 100)
        (is (= #{task-1 task-2}
               (set (map :task (t2/select :model/TaskHistory)))))))))

(deftest with-task-history-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "success path:"
      (let [task-name (mt/random-name)]
        (testing "task history is created before executing the body"
          (task-history/with-task-history {:task task-name}
            (is (=? {:status     :started
                     :started_at (mt/malli=? some?)
                     :ended_at   (mt/malli=? nil?)
                     :duration   (mt/malli=? nil?)}
                    (t2/select-one :model/TaskHistory :task task-name)))))
        (testing "when the task is done, updates status and duration correctly"
          (is (=? {:status     :success
                   :started_at (mt/malli=? some?)
                   :ended_at   (mt/malli=? some?)
                   :duration   (mt/malli=? nat-int?)}
                  (t2/select-one :model/TaskHistory :task task-name))))))
    (testing "failed path:"
      (let [task-name (mt/random-name)]
        (try
          (task-history/with-task-history {:task task-name}
            (throw (Exception. "test")))
          (catch Exception _e
            (testing "if a task throws an exception, updates its status and duration correctly"
              (is (=? {:status     :failed
                       :started_at (mt/malli=? some?)
                       :ended_at   (mt/malli=? some?)
                       :duration   (mt/malli=? nat-int?)}
                      (t2/select-one :model/TaskHistory :task task-name))))))))))

(deftest with-task-history-using-callback-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "on-success-info"
      (let [task-name (mt/random-name)]
        (task-history/with-task-history {:task            task-name
                                         :task_details    {:id 1}
                                         :on-success-info (fn [info result]
                                                            (testing "info should have task_details, logs, and updated status"
                                                              (is (=? {:task_details {:id 1}
                                                                       :logs         (mt/malli=? vector?)
                                                                       :status       :success}
                                                                      info)))
                                                            (update info :task_details assoc :result result))}
          42)
        (is (= {:status       :success
                :task_details {:id     1
                               :result 42}}
               (t2/select-one [:model/TaskHistory :status :task_details] :task task-name)))))

    (testing "on-fail-info"
      (let [task-name (mt/random-name)]
        (u/ignore-exceptions
          (task-history/with-task-history {:task         task-name
                                           :task_details {:id 1}
                                           :on-fail-info (fn [info e]
                                                           (testing "info should have task_details and updated status"
                                                             (is (=? {:status       :failed
                                                                      :task_details {:status        :failed
                                                                                     :message       "test"
                                                                                     :stacktrace    (mt/malli=? :any)
                                                                                     :ex-data       {:reason :test}
                                                                                     :original-info {:id 1}}}
                                                                     info)))
                                                           (update info :task_details assoc :reason (ex-message e)))}
            (throw (ex-info "test" {:reason :test}))))
        (is (=? {:status       :failed
                 :task_details {:status        "failed"
                                :exception     "class clojure.lang.ExceptionInfo"
                                :message       "test"
                                :stacktrace    (mt/malli=? :any)
                                :ex-data       {:reason "test"}
                                :original-info {:id 1}
                                :reason         "test"}}
                (t2/select-one [:model/TaskHistory :status :task_details] :task task-name)))))))

(deftest log-capture-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "logs are captured on success"
      (let [task-name (mt/random-name)]
        (binding [task-history/*log-capture-clock* (Clock/fixed (Instant/ofEpochMilli 1000) (ZoneId/of "UTC"))]
          (task-history/with-task-history {:task task-name}
            (log/info "info message")
            (log/warn "warning message")
            (log/error "error message")))
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :success status))
          (is (=? [{:level "info",  :msg "info message",    :timestamp "1970-01-01T00:00:01Z", :fqns string?}
                   {:level "warn",  :msg "warning message", :timestamp "1970-01-01T00:00:01Z", :fqns string?}
                   {:level "error", :msg "error message",   :timestamp "1970-01-01T00:00:01Z", :fqns string?}]
                  logs)))))

    (testing "logs are captured on failure"
      (let [task-name (mt/random-name)]
        (u/ignore-exceptions
          (task-history/with-task-history {:task task-name}
            (log/info "before exception")
            (throw (ex-info "Test failure" {:reason :test}))))
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :failed status))
          (is (=? [{:level "info", :msg "before exception", :timestamp string?, :fqns string?}] logs)))))

    (testing "exception details are captured in logs"
      (let [task-name (mt/random-name)]
        (u/ignore-exceptions
          (task-history/with-task-history {:task task-name}
            (log/error (Exception. "Test exception") "error message")))
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :success status))
          (is (=? [{:level     "error"
                    :msg       "error message"
                    :timestamp string?
                    :fqns      string?
                    :exception (mt/malli=? [:sequential string?])}]
                  logs)))))

    (testing "debug/trace are elided"
      (let [task-name (mt/random-name)]
        (task-history/with-task-history {:task task-name}
          (log/error "error")
          (log/fatal "fatal"))
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :success status))
          (is (=? [{:level "error"} {:level "fatal"}] logs)))))

    (testing "task with no logs"
      (let [task-name (mt/random-name)]
        (task-history/with-task-history {:task task-name})
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :success status))
          (is (= [] logs)))))))

(deftest log-truncation-test
  (mt/with-model-cleanup [:model/TaskHistory]
    (testing "logs are truncated when threshold is exceeded"
      (let [task-name (mt/random-name)
            threshold 5]
        (with-redefs [task-history/log-capture-truncation-threshold threshold]
          (binding [task-history/*log-capture-clock* (Clock/fixed (Instant/ofEpochMilli 1000) (ZoneId/of "UTC"))]
            (task-history/with-task-history {:task task-name}
              ;; Generate more messages than the threshold
              (dotimes [i 10]
                (set! task-history/*log-capture-clock* (Clock/fixed (Instant/ofEpochMilli (+ 1000 i)) (ZoneId/of "UTC")))
                (log/info (str "message " i))
                (log/warn (str "warning " i))))))
        (let [{:keys [logs status]} (t2/select-one :model/TaskHistory :task task-name)]
          (is (= :success status))
          (testing "logs include truncation message plus threshold entries"
            (is (= (inc threshold) (count logs))))
          (testing "first entry is truncation message"
            (let [{:keys [level timestamp msg trunc]} (first logs)]
              (is (= "info" level))
              (is (= "1970-01-01T00:00:01.007Z" timestamp) ":timestamp is of the last removed message")
              (is (= "[truncated] 15 messages" msg))
              (testing "truncation metadata tracks removed messages by level"
                (let [{:keys [start-timestamp last-timestamp levels]} trunc]
                  (is (= "1970-01-01T00:00:01Z" start-timestamp))
                  (is (= "1970-01-01T00:00:01.007Z" last-timestamp))
                  (is (= {:info 8, :warn 7} levels))))))
          (testing "remaining entries are the most recent messages"
            (let [remaining-logs (rest logs)]
              (is (= threshold (count remaining-logs)))
              ;; The last 5 entries should be the final messages
              (is (=? [{:level "warn" :msg "warning 7" :timestamp "1970-01-01T00:00:01.007Z" :fqns string?}
                       {:level "info" :msg "message 8" :timestamp "1970-01-01T00:00:01.008Z" :fqns string?}
                       {:level "warn" :msg "warning 8" :timestamp "1970-01-01T00:00:01.008Z" :fqns string?}
                       {:level "info" :msg "message 9" :timestamp "1970-01-01T00:00:01.009Z" :fqns string?}
                       {:level "warn" :msg "warning 9" :timestamp "1970-01-01T00:00:01.009Z" :fqns string?}]
                      remaining-logs)))))))))
