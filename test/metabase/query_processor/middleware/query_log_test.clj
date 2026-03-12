(ns metabase.query-processor.middleware.query-log-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.config.core :as config]
   [metabase.query-processor.middleware.query-log :as qp.middleware.query-log]
   [metabase.util.log.capture :as log.capture]))

(defn- mock-qp
  "A mock QP function that simulates the reducing function pattern.
   Calls rff to get rf, reduces rows through it, then calls completing arity."
  [rows]
  (fn [_query rff]
    (let [metadata {:cols [{:name "id"}]}
          rf       (rff metadata)
          result   (reduce rf (rf) rows)]
      ;; Call the completing arity to trigger post-processing (e.g., summary emission)
      (rf result))))

(defn- simple-rff
  "A simple result-first function for tests."
  [metadata]
  (fn
    ([]        {:data {:rows [] :cols (:cols metadata)}})
    ([acc]     acc)
    ([acc row] (update-in acc [:data :rows] conj row))))

(defn- run-middleware
  "Run the query-log middleware with a mock QP and return the result."
  [query & {:keys [rows] :or {rows [[1] [2] [3]]}}]
  (let [qp (qp.middleware.query-log/query-log-middleware (mock-qp rows))]
    (qp query simple-rff)))

(defn- captured-messages
  "Run middleware and capture INFO log messages."
  [query & {:keys [rows] :or {rows [[1] [2] [3]]}}]
  (log.capture/with-log-messages-for-level [messages [metabase.query-processor.middleware.query-log :info]]
    (run-middleware query :rows rows)
    (messages)))

(deftest ^:parallel summary-log-fields-test
  (testing "A userland query produces an INFO log message containing request-id, database-id, executor-id, context, time, and query-count"
    (binding [config/*request-id* "test-request-123"]
      (let [query    {:database 1
                      :type     :query
                      :query    {:source-table 2}
                      :info     {:executed-by 42
                                 :context     :ad-hoc}
                      :middleware {:userland-query? true}}
            messages (captured-messages query)]
        (is (= 1 (count messages))
            "Exactly one INFO message should be emitted")
        (let [msg (:message (first messages))]
          (is (str/includes? msg "request-id=test-request-123")
              "Should contain request-id")
          (is (str/includes? msg "database=1")
              "Should contain database-id")
          (is (str/includes? msg "user=42")
              "Should contain user-id")
          (is (str/includes? msg "context=ad-hoc")
              "Should contain context")
          (is (str/includes? msg "queries=1")
              "Should contain query count")
          (is (re-find #"time=\d+ms" msg)
              "Should contain time in ms")
          (is (re-find #"rows=\d+" msg)
              "Should contain row count"))))))

(deftest ^:parallel card-id-in-summary-test
  (testing "A userland query for a saved card includes card-id in the summary"
    (binding [config/*request-id* "test-card-req"]
      (let [query    {:database 1
                      :type     :query
                      :query    {:source-table 2}
                      :info     {:executed-by 42
                                 :context     :question
                                 :card-id     99}
                      :middleware {:userland-query? true}}
            messages (captured-messages query)]
        (is (= 1 (count messages)))
        (is (str/includes? (:message (first messages)) "card=99")
            "Should contain card-id")))))

(deftest ^:parallel dashboard-id-in-summary-test
  (testing "A userland query from a dashboard includes dashboard-id in the summary"
    (binding [config/*request-id* "test-dash-req"]
      (let [query    {:database 1
                      :type     :query
                      :query    {:source-table 2}
                      :info     {:executed-by 42
                                 :context     :dashboard
                                 :card-id     99
                                 :dashboard-id 77}
                      :middleware {:userland-query? true}}
            messages (captured-messages query)]
        (is (= 1 (count messages)))
        (is (str/includes? (:message (first messages)) "dashboard=77")
            "Should contain dashboard-id")))))

(deftest ^:parallel non-userland-passthrough-test
  (testing "A non-userland query does NOT produce a summary log line"
    (binding [config/*request-id* "test-sync-req"]
      (let [query    {:database 1
                      :type     :query
                      :query    {:source-table 2}
                      :info     {:context :sync}}
            messages (captured-messages query)]
        (is (= 0 (count messages))
            "Non-userland queries should not produce summary log lines")))))

(deftest ^:parallel fallback-uuid-test
  (testing "When *request-id* is nil, a fallback UUID is generated and used as the correlation ID"
    (binding [config/*request-id* nil]
      (let [query    {:database 1
                      :type     :query
                      :query    {:source-table 2}
                      :info     {:executed-by 42
                                 :context     :ad-hoc}
                      :middleware {:userland-query? true}}
            messages (captured-messages query)]
        (is (= 1 (count messages)))
        (let [msg (:message (first messages))]
          (is (re-find #"request-id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" msg)
              "Should contain a UUID as fallback request-id"))))))

(deftest concurrent-isolation-test
  (testing "Two concurrent requests produce summary lines with different request-ids"
    (let [all-messages (atom [])
          query        {:database 1
                        :type     :query
                        :query    {:source-table 2}
                        :info     {:executed-by 42
                                   :context     :ad-hoc}
                        :middleware {:userland-query? true}}
          f1 (future
               (binding [config/*request-id* "concurrent-req-A"]
                 (let [msgs (captured-messages query)]
                   (swap! all-messages into msgs))))
          f2 (future
               (binding [config/*request-id* "concurrent-req-B"]
                 (let [msgs (captured-messages query)]
                   (swap! all-messages into msgs))))]
      @f1
      @f2
      (let [messages @all-messages
            req-ids  (map (fn [m]
                            (second (re-find #"request-id=(\S+)" (:message m))))
                          messages)]
        (is (= 2 (count messages))
            "Should have exactly 2 summary lines")
        (is (= #{"concurrent-req-A" "concurrent-req-B"} (set req-ids))
            "Each request should have its own request-id")))))
