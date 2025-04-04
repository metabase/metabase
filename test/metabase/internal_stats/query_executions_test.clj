(ns metabase.internal-stats.query-executions-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [java-time.api :as t]
   [metabase.internal-stats.query-executions :as sut]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(def ^:private query-execution-defaults
  {:hash         (qp.util/query-hash {})
   :running_time 1
   :result_rows  1
   :native       false
   :executor_id  nil
   :card_id      nil
   :context      :ad-hoc
   :started_at   (t/offset-date-time)})

(deftest query-execution-24h-filtering-test
  (t/with-clock (t/mock-clock 1583351015000)
    (let [before (sut/query-executions-all-time-and-last-24h)
          one-year-ago-defaults (assoc query-execution-defaults
                                       :started_at (-> (t/offset-date-time)
                                                       (t/minus (t/years 1))))]
      (mt/with-temp [:model/User           u {}
                     :model/QueryExecution _ one-year-ago-defaults
                     :model/QueryExecution _ (assoc one-year-ago-defaults :embedding_client "embedding-sdk-react")
                     :model/QueryExecution _ (assoc one-year-ago-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc one-year-ago-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc one-year-ago-defaults
                                                    :embedding_client "embedding-iframe"
                                                    :executor_id (u/the-id u))
                     :model/QueryExecution _ (assoc one-year-ago-defaults :context :public-question)
                     :model/QueryExecution _ (assoc one-year-ago-defaults :context :public-csv-download)
                     :model/QueryExecution _ query-execution-defaults
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-sdk-react")
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc query-execution-defaults :context :public-question)
                     :model/QueryExecution _ (assoc query-execution-defaults :context :public-csv-download)]
        (let [after (sut/query-executions-all-time-and-last-24h)
              before-internal (-> before :query-executions :internal)
              after-internal (-> after :query-executions :internal)
              before-24h-internal (-> before :query-executions-24h :internal)
              after-24h-internal (-> after :query-executions-24h :internal)]
          (is (= 2 (- after-internal before-internal)))
          (is (= 1 (- after-24h-internal before-24h-internal)))
          (is (= 2 (- (-> after :query-executions :sdk_embed)
                      (-> before :query-executions :sdk_embed))))
          (is (= 4 (- (-> after :query-executions :static_embed)
                      (-> before :query-executions :static_embed))))
          (is (= 4 (- (-> after :query-executions :public_link)
                      (-> before :query-executions :public_link))))
          (is (= 1 (- (-> after :query-executions :interactive_embed)
                      (-> before :query-executions :interactive_embed))))
          (is (= 1 (- (-> after :query-executions-24h :sdk_embed)
                      (-> before :query-executions-24h :sdk_embed))))
          (is (= 2 (- (-> after :query-executions-24h :static_embed)
                      (-> before :query-executions-24h :static_embed))))
          (is (= 2 (- (-> after :query-executions-24h :public_link)
                      (-> before :query-executions-24h :public_link))))
          (is (= 0 (- (-> after :query-executions-24h :interactive_embed)
                      (-> before :query-executions-24h :interactive_embed)))))))))

(deftest query-execution-last-utc-day-test
  (testing "count query exeuections over the previous utc day")
  (t/with-clock (t/mock-clock 1583351015000)
    (let [yesterday-defaults (assoc query-execution-defaults
                                    :started_at (-> (t/offset-date-time (t/zone-offset "+00"))
                                                    (t/minus (t/days 1))))]
      (mt/with-temp [:model/User           u {}
                     :model/QueryExecution _ yesterday-defaults
                     :model/QueryExecution _ (assoc yesterday-defaults :embedding_client "embedding-sdk-react")
                     :model/QueryExecution _ (assoc yesterday-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc yesterday-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc yesterday-defaults
                                                    :embedding_client "embedding-iframe"
                                                    :executor_id (u/the-id u))
                     :model/QueryExecution _ (assoc yesterday-defaults :context :public-question)
                     :model/QueryExecution _ (assoc yesterday-defaults :context :public-csv-download)
                     :model/QueryExecution _ query-execution-defaults
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-sdk-react")
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc query-execution-defaults :embedding_client "embedding-iframe")
                     :model/QueryExecution _ (assoc query-execution-defaults :context :public-question)
                     :model/QueryExecution _ (assoc query-execution-defaults :context :public-csv-download)]
        (is (= {:query_executions_sdk_embed 1,
                :query_executions_interactive_embed 1,
                :query_executions_static_embed 2,
                :query_executions_public_link 2,
                :query_executions_internal 1}
               (sut/query-execution-last-utc-day)))))))
