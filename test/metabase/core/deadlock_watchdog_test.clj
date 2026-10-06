(ns metabase.core.deadlock-watchdog-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.core.deadlock-watchdog :as watchdog]
   [metabase.test :as mt]
   [metabase.test.util :as tu])
  (:import
   (java.lang.management ManagementFactory ThreadMXBean)
   (java.util.concurrent CountDownLatch TimeUnit)
   (java.util.concurrent.locks ReentrantLock)))

(set! *warn-on-reflection* true)

(def ^:private ^ThreadMXBean thread-bean (ManagementFactory/getThreadMXBean))

(defn- start-daemon-thread! ^Thread [^String thread-name f]
  (doto (Thread. ^Runnable f thread-name)
    (.setDaemon true)
    (.start)))

(defn- tick!
  "One watchdog check with an exit fn that records the code rather than exiting."
  [state exits opts]
  (let [defaults {:thread-bean thread-bean
                  :now         0
                  :exit?       false
                  :exit!       #(swap! exits conj %)}]
    (#'watchdog/tick! state (merge defaults opts))))

(defn- messages-about
  "The captured messages that mention `needle`; other tests may leave threads blocked or deadlocked in this JVM."
  [messages needle]
  (filter #(str/includes? (:message %) needle) (messages)))

(deftest deadlock-test
  (testing "a deadlock is logged once with every thread's details, and exits on the second consecutive check"
    ;; Each thread holds a monitor and a lock, then waits for the other's lock. The cycle is through ReentrantLocks
    ;; taken interruptibly, so the test can break the deadlock afterwards; a monitor deadlock could never be undone.
    (let [lock-a    (ReentrantLock.)
          lock-b    (ReentrantLock.)
          both-held (CountDownLatch. 2)
          deadlock  (fn [^ReentrantLock mine ^ReentrantLock theirs monitor]
                      (fn []
                        (locking monitor
                          (.lock mine)
                          (try
                            (.countDown both-held)
                            (.await both-held)
                            (.lockInterruptibly theirs)
                            (.unlock theirs)
                            (catch InterruptedException _)
                            (finally
                              (.unlock mine))))))
          thread-a  (start-daemon-thread! "watchdog-test-thread-a" (deadlock lock-a lock-b (Object.)))
          thread-b  (start-daemon-thread! "watchdog-test-thread-b" (deadlock lock-b lock-a (Object.)))
          ids       #{(.getId thread-a) (.getId thread-b)}
          exits     (atom [])]
      (try
        (is (tu/poll-until 5000 (set/subset? ids (set (.findDeadlockedThreads thread-bean))))
            "the JVM did not report the two threads as deadlocked")
        (mt/with-log-messages-for-level [messages [metabase.core.deadlock-watchdog :error]]
          (let [state          (tick! @#'watchdog/initial-state exits {:now 1000})
                [event & more] (messages-about messages "Deadlock detected")]
            (is (some? event) "no deadlock was logged")
            (is (nil? more) "the cycle was logged more than once")
            (is (= :error (:level event)))
            (doseq [needle ["Deadlock detected: 2 threads"
                            "Thread \"watchdog-test-thread-a\""
                            "Thread \"watchdog-test-thread-b\""
                            "WAITING waiting on java.util.concurrent.locks.ReentrantLock"
                            "owned by \"watchdog-test-thread-a\""
                            "owned by \"watchdog-test-thread-b\""
                            "holds monitors: java.lang.Object@"
                            "holds synchronizers: java.util.concurrent.locks.ReentrantLock"
                            "java.util.concurrent.locks.ReentrantLock.lockInterruptibly"]]
              (is (str/includes? (:message event) needle)))
            (is (= [] @exits) "the first check must not exit")
            (testing "the second consecutive check with exit enabled exits with code 3 and does not log the cycle again"
              (tick! state exits {:now 2000, :exit? true})
              (is (= [3] @exits))
              (is (= 1 (count (messages-about messages "Deadlock detected")))))))
        (finally
          (.interrupt thread-a)
          (.interrupt thread-b)
          (.join thread-a 5000)
          (.join thread-b 5000)
          (is (not (.isAlive thread-a)))
          (is (not (.isAlive thread-b))))))))

(deftest long-monitor-wait-test
  (testing "a thread BLOCKED on one monitor past the threshold is warned about, naming the owner, and nothing exits"
    (let [monitor (Object.)
          held    (CountDownLatch. 1)
          release (promise)
          holder  (start-daemon-thread! "watchdog-test-holder"
                                        (fn []
                                          (locking monitor
                                            (.countDown held)
                                            (deref release 10000 nil))))
          _       (is (.await held 5 TimeUnit/SECONDS) "the holder never took the monitor")
          waiter  (start-daemon-thread! "watchdog-test-waiter" (fn [] (locking monitor nil)))
          exits   (atom [])
          opts    {:exit? true, :long-block-threshold-ms 1000}]
      (try
        (is (tu/poll-until 5000 (= Thread$State/BLOCKED (.getState waiter)))
            "the waiter never blocked on the monitor")
        (mt/with-log-messages-for-level [messages [metabase.core.deadlock-watchdog :warn]]
          (let [warnings       #(messages-about messages "watchdog-test-waiter")
                state          (tick! @#'watchdog/initial-state exits (assoc opts :now 0))
                _              (is (empty? (warnings)) "no warning before the threshold")
                state          (tick! state exits (assoc opts :now 500))
                _              (is (empty? (warnings)) "no warning before the threshold")
                state          (tick! state exits (assoc opts :now 1500))
                [event & more] (warnings)]
            (is (some? event) "no long-wait warning was logged")
            (is (nil? more))
            (is (= :warn (:level event)))
            (doseq [needle ["Thread \"watchdog-test-waiter\""
                            "BLOCKED on java.lang.Object@"
                            "for 1 s"
                            "owned by \"watchdog-test-holder\""
                            "The owner, Thread \"watchdog-test-holder\""]]
              (is (str/includes? (:message event) needle)))
            (testing "the same wait is not warned about again straight away"
              (tick! state exits (assoc opts :now 2000))
              (is (= 1 (count (warnings)))))
            (is (= [] @exits) "a long wait must never exit")))
        (finally
          (deliver release true)
          (.join holder 5000)
          (.join waiter 5000)
          (is (not (.isAlive holder)))
          (is (not (.isAlive waiter))))))))
