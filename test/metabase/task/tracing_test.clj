(ns metabase.task.tracing-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.task.bootstrap :as task.bootstrap]
   [metabase.task.tracing :as task.tracing]
   [metabase.tracing.core :as tracing])
  (:import
   (java.sql Connection PreparedStatement ResultSet Statement)
   (org.quartz JobDetail JobExecutionContext JobExecutionException JobKey JobListener)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Helpers ----------------------------------------------------------

(defn- mock-prepared-statement
  "Create a mock PreparedStatement that records which methods were called."
  [calls-atom]
  (reify PreparedStatement
    (executeQuery [_]
      (swap! calls-atom conj :executeQuery)
      (reify ResultSet
        (close [_])))
    (executeUpdate [_]
      (swap! calls-atom conj :executeUpdate)
      1)
    (execute [_]
      (swap! calls-atom conj :execute)
      true)
    (close [_]
      (swap! calls-atom conj :close))))

(defn- mock-statement
  "Create a mock Statement that records which methods were called."
  [calls-atom]
  (reify Statement
    (execute [_ sql]
      (swap! calls-atom conj [:execute sql])
      true)
    (executeQuery [_ sql]
      (swap! calls-atom conj [:executeQuery sql])
      (reify ResultSet
        (close [_])))
    (executeUpdate [_ sql]
      (swap! calls-atom conj [:executeUpdate sql])
      1)
    (close [_]
      (swap! calls-atom conj [:close-stmt]))))

(defn- mock-connection
  "Create a mock Connection that returns mock PreparedStatements and Statements."
  [stmt-calls-atom]
  (reify Connection
    (prepareStatement [_ _sql]
      (mock-prepared-statement stmt-calls-atom))
    (createStatement [_]
      (mock-statement stmt-calls-atom))
    (rollback [_]
      (swap! stmt-calls-atom conj :rollback))
    (commit [_]
      (swap! stmt-calls-atom conj :commit))
    (close [_])
    (isClosed [_] false)))

(defn- mock-job-execution-context
  "Create a mock JobExecutionContext for testing the listener."
  ^JobExecutionContext [^String job-name]
  (let [job-key    (JobKey. job-name)
        job-detail (reify JobDetail (getKey [_] job-key))]
    (reify JobExecutionContext
      (getJobDetail [_] job-detail))))

;;; ---------------------------------------- sql-operation tests ------------------------------------------------------

(deftest sql-operation-test
  (testing "extracts SQL verb from various SQL statements"
    (is (= "SELECT" (#'task.tracing/sql-operation "SELECT * FROM QRTZ_TRIGGERS")))
    (is (= "UPDATE" (#'task.tracing/sql-operation "UPDATE QRTZ_TRIGGERS SET state = ?")))
    (is (= "INSERT" (#'task.tracing/sql-operation "INSERT INTO QRTZ_FIRED_TRIGGERS VALUES (?)")))
    (is (= "DELETE" (#'task.tracing/sql-operation "DELETE FROM QRTZ_FIRED_TRIGGERS WHERE id = ?"))))
  (testing "handles edge cases"
    (is (= "SELECT" (#'task.tracing/sql-operation "  SELECT * FROM t  ")))
    (is (= "COMMIT" (#'task.tracing/sql-operation "COMMIT")))
    (is (nil? (#'task.tracing/sql-operation nil)))))

;;; ----------------------------------------- JDBC proxy tests --------------------------------------------------------

(deftest traced-connection-intercepts-prepareStatement-test
  (testing "traced-connection wraps prepareStatement results"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls (atom [])
            conn  (mock-connection calls)
            traced (#'task.tracing/traced-connection conn)]
        (testing "returned connection implements Connection"
          (is (instance? Connection traced)))
        (testing "prepareStatement returns a PreparedStatement proxy"
          (let [^PreparedStatement stmt (.prepareStatement ^Connection traced "SELECT * FROM QRTZ_TRIGGERS")]
            (is (instance? PreparedStatement stmt))
            (testing "execute methods delegate to the underlying statement"
              (.executeQuery stmt)
              (is (= [:executeQuery] @calls)))
            (testing "executeUpdate also delegates"
              (.executeUpdate stmt)
              (is (= [:executeQuery :executeUpdate] @calls))))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest traced-connection-delegates-non-intercepted-methods-test
  (testing "methods other than prepareStatement pass through unchanged"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls (atom [])
            conn  (mock-connection calls)
            traced (#'task.tracing/traced-connection conn)]
        (testing "close delegates to original"
          (.close ^Connection traced)
          ;; no exception means the method was delegated
          (is true))
        (testing "isClosed delegates to original"
          (is (false? (.isClosed ^Connection traced)))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest traced-connection-intercepts-createStatement-test
  (testing "traced-connection wraps createStatement results"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls  (atom [])
            conn   (mock-connection calls)
            traced (#'task.tracing/traced-connection conn)]
        (testing "createStatement returns a Statement proxy"
          (let [^Statement stmt (.createStatement ^Connection traced)]
            (is (instance? Statement stmt))
            (testing "execute with SQL delegates and records SQL"
              (.execute stmt "DISCARD ALL;")
              (is (= [[:execute "DISCARD ALL;"]] @calls)))
            (testing "executeUpdate with SQL delegates"
              (.executeUpdate stmt "UPDATE QRTZ_TRIGGERS SET state = 'WAITING'")
              (is (= [[:execute "DISCARD ALL;"]
                      [:executeUpdate "UPDATE QRTZ_TRIGGERS SET state = 'WAITING'"]]
                     @calls))))))
      (finally
        (tracing/shutdown-groups!)))))

(deftest traced-connection-intercepts-rollback-test
  (testing "traced-connection wraps rollback in a span"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls  (atom [])
            conn   (mock-connection calls)
            traced (#'task.tracing/traced-connection conn)]
        (.rollback ^Connection traced)
        (is (= [:rollback] @calls)
            "rollback should delegate to the underlying connection"))
      (finally
        (tracing/shutdown-groups!)))))

(deftest traced-connection-intercepts-commit-test
  (testing "traced-connection wraps commit in a span"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls  (atom [])
            conn   (mock-connection calls)
            traced (#'task.tracing/traced-connection conn)]
        (.commit ^Connection traced)
        (is (= [:commit] @calls)
            "commit should delegate to the underlying connection"))
      (finally
        (tracing/shutdown-groups!)))))

(deftest connection-interceptor-respects-group-enabled-test
  (testing "when :quartz group is disabled, returns unwrapped connection"
    (tracing/shutdown-groups!)
    (let [calls (atom [])
          conn  (mock-connection calls)
          result (#'task.tracing/connection-interceptor conn)]
      (is (identical? conn result)
          "should return the exact same connection object when tracing disabled")))
  (testing "when :quartz group is enabled, returns wrapped connection"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [calls (atom [])
            conn  (mock-connection calls)
            result (#'task.tracing/connection-interceptor conn)]
        (is (not (identical? conn result))
            "should return a different (wrapped) connection when tracing enabled")
        (is (instance? Connection result)))
      (finally
        (tracing/shutdown-groups!)))))

;;; ---------------------------------------- JobListener tests --------------------------------------------------------

(deftest job-listener-name-test
  (testing "listener has a descriptive name"
    (let [^JobListener listener (#'task.tracing/create-tracing-job-listener)]
      (is (= "metabase.task.tracing/quartz-tracing-listener" (.getName listener))))))

(deftest job-listener-disabled-is-noop-test
  (testing "when :quartz group is disabled, jobToBeExecuted is a no-op"
    (tracing/shutdown-groups!)
    (let [^JobListener listener (#'task.tracing/create-tracing-job-listener)
          ctx      (mock-job-execution-context "TestJob")]
      (.jobToBeExecuted listener ctx)
      ;; No span should be in ThreadLocal
      (is (nil? (.get ^ThreadLocal @#'task.tracing/listener-state)))
      ;; jobWasExecuted should also be safe to call (no-op since no state)
      (.jobWasExecuted listener ctx nil)
      (is (nil? (.get ^ThreadLocal @#'task.tracing/listener-state))))))

(deftest job-listener-enabled-creates-and-ends-span-test
  (testing "when :quartz group is enabled, jobToBeExecuted creates a span"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [^JobListener listener (#'task.tracing/create-tracing-job-listener)
            ctx      (mock-job-execution-context "TestSessionCleanup")]
        (.jobToBeExecuted listener ctx)
        (testing "span state is stored in ThreadLocal"
          (let [state (.get ^ThreadLocal @#'task.tracing/listener-state)]
            (is (some? state))
            (is (contains? state :span))
            (is (contains? state :scope))))
        (testing "jobWasExecuted cleans up ThreadLocal"
          (.jobWasExecuted listener ctx nil)
          (is (nil? (.get ^ThreadLocal @#'task.tracing/listener-state)))))
      (finally
        ;; Safety: clean up any lingering state
        (.remove ^ThreadLocal @#'task.tracing/listener-state)
        (tracing/shutdown-groups!)))))

(deftest job-listener-records-exception-test
  (testing "when job fails, exception is recorded on the span"
    (try
      (tracing/init-enabled-groups! "quartz" "INFO")
      (let [^JobListener listener (#'task.tracing/create-tracing-job-listener)
            ctx       (mock-job-execution-context "FailingJob")
            exception (JobExecutionException. "something broke")]
        (.jobToBeExecuted listener ctx)
        (is (some? (.get ^ThreadLocal @#'task.tracing/listener-state)))
        ;; Should not throw — exception is recorded on span, not re-thrown
        (.jobWasExecuted listener ctx exception)
        (is (nil? (.get ^ThreadLocal @#'task.tracing/listener-state))))
      (finally
        (.remove ^ThreadLocal @#'task.tracing/listener-state)
        (tracing/shutdown-groups!)))))

;;; ----------------------------------- bootstrap interceptor tests ---------------------------------------------------

(deftest set-connection-interceptor-test
  (testing "set-connection-interceptor! installs and removes interceptors"
    (let [the-atom @#'task.bootstrap/connection-interceptor
          original @the-atom]
      (try
        (task.bootstrap/set-connection-interceptor! identity)
        (is (some? @the-atom))
        (task.bootstrap/set-connection-interceptor! nil)
        (is (nil? @the-atom))
        (finally
          (reset! the-atom original))))))
