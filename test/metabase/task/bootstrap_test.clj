(ns metabase.task.bootstrap-test
  (:require
   [clojure.test :refer :all]
   [metabase.task.bootstrap :as task.bootstrap]
   [toucan2.connection :as t2.conn])
  (:import
   (java.sql Connection PreparedStatement)))

(set! *warn-on-reflection* true)

(defn- mock-connection
  "Create a mock Connection that records which methods were called."
  []
  (let [calls (atom [])
        mock  (reify Connection
                (close [_] (swap! calls conj :close))
                (commit [_] (swap! calls conj :commit))
                (rollback [_] (swap! calls conj :rollback))
                (setAutoCommit [_ _v] (swap! calls conj :setAutoCommit))
                (getAutoCommit [_] (swap! calls conj :getAutoCommit) false)
                (isClosed [_] (swap! calls conj :isClosed) false)
                (prepareStatement [_ _sql]
                  (swap! calls conj :prepareStatement)
                  (reify PreparedStatement
                    (close [_]))))]
    {:connection mock
     :calls      calls}))

(deftest non-closeable-connection-suppresses-lifecycle-methods-test
  (testing "close, commit, rollback, and setAutoCommit are suppressed on the proxy"
    (let [{:keys [connection calls]} (mock-connection)
          provider                   (task.bootstrap/->ConnectionProvider)]
      (binding [t2.conn/*current-connectable* connection]
        (let [^Connection proxy (.getConnection provider)]
          (.close proxy)
          (.commit proxy)
          (.rollback proxy)
          (.setAutoCommit proxy false)
          (is (empty? @calls)
              "None of the suppressed methods should have been forwarded to the underlying connection"))))))

(deftest non-closeable-connection-delegates-other-methods-test
  (testing "Non-lifecycle methods are delegated to the underlying connection"
    (let [{:keys [connection calls]} (mock-connection)
          provider                   (task.bootstrap/->ConnectionProvider)]
      (binding [t2.conn/*current-connectable* connection]
        (let [^Connection proxy (.getConnection provider)]
          (.getAutoCommit proxy)
          (.isClosed proxy)
          (.prepareStatement proxy "SELECT 1")
          (is (= [:getAutoCommit :isClosed :prepareStatement] @calls)
              "Non-suppressed methods should be forwarded to the underlying connection"))))))

(deftest getConnection-uses-pool-when-no-current-connectable-test
  (testing "When *current-connectable* is not a Connection, getConnection gets a fresh connection from the pool"
    (let [provider                   (task.bootstrap/->ConnectionProvider)
          ^Connection conn (.getConnection provider)]
      (is (instance? Connection conn))
      (.close conn))))

(deftest getConnection-uses-pool-when-connectable-is-not-connection-test
  (testing "When *current-connectable* is a non-Connection value, getConnection gets a fresh connection from the pool"
    (let [provider (task.bootstrap/->ConnectionProvider)]
      (binding [t2.conn/*current-connectable* :some-keyword]
        (let [^Connection conn (.getConnection provider)]
          (is (instance? Connection conn))
          (.close conn))))))
