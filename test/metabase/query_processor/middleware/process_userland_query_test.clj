(ns metabase.query-processor.middleware.process-userland-query-test
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.events :as events]
   [metabase.lib.core :as lib]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.process-userland-query
    :as process-userland-query]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn do-with-query-execution [query run]
  (mt/with-clock #t "2020-02-04T12:22-08:00[US/Pacific]"
    (let [original-hash (qp.util/query-hash query)
          result        (promise)]
      (with-redefs [process-userland-query/save-execution-metadata!*
                    (fn [query-execution _field-usages]
                      (when-let [^bytes qe-hash (:hash query-execution)]
                        (deliver
                         result
                         (if (java.util.Arrays/equals qe-hash original-hash)
                           query-execution
                           ;; if you're seeing this there is probably some
                           ;; bug that is causing query hashes to get
                           ;; calculated in an inconsistent manner; check
                           ;; `:query` vs `:query-execution-query`
                           (ex-info (format "%s: Query hashes are not equal!" `do-with-query-execution)
                                    {:query                 query
                                     :original-hash         (some-> original-hash codecs/bytes->hex)
                                     :query-execution       query-execution
                                     :query-execution-hash  (some-> qe-hash codecs/bytes->hex)
                                     :query-execution-query (:json_query query-execution)})))))]
        (run
         (fn qe-result* []
           (let [qe (deref result 1000 ::timed-out)]
             (cond-> qe
               (:running_time qe) (update :running_time int?)
               (:hash qe)         (update :hash (fn [^bytes a-hash]
                                                  (some-> a-hash codecs/bytes->hex)))))))))))

(defmacro with-query-execution {:style/indent 1} [[qe-result-binding query] & body]
  `(do-with-query-execution ~query (fn [~qe-result-binding] ~@body)))

(defn- process-userland-query
  [query]
  (let [query    (qp/userland-query query)
        metadata {}
        rows     []
        qp       (process-userland-query/process-userland-query-middleware
                  (fn [query rff]
                    (binding [qp.pipeline/*execute* (fn [_driver _query respond]
                                                      (respond metadata rows))]
                      (qp.pipeline/*run* query rff))))]
    (binding [driver/*driver* :h2]
      (qp.store/with-metadata-provider (mt/id)
        (qp query qp.reducible/default-rff)))))

(deftest success-test
  (let [query {:database 2, :type :query, :query {:source-table 26}}]
    (with-query-execution [qe query]
      (is (= #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
             (t/zoned-date-time))
          "sanity check")
      (is (=? {:status                 :completed
               :data                   {}
               :row_count              0
               :database_id            2
               :started_at             #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :json_query             (dissoc (mt/userland-query query) :info)
               :average_execution_time nil
               :context                nil
               :running_time           int?
               :cached                 false}
              (process-userland-query query))
          "Result should have query execution info")
      (is (=? {:hash         "58af781ea2ba252ce3131462bdc7c54bc57538ed965d55beec62928ce8b32635"
               :database_id  2
               :result_rows  0
               :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :executor_id  nil
               :json_query   (dissoc (mt/userland-query query) :info)
               :native       false
               :pulse_id     nil
               :card_id      nil
               :action_id    nil
               :is_sandboxed false
               :context      nil
               :running_time true
               :cache_hit    false
               :cache_hash   nil ;; this is filled only for eligible queries
               :dashboard_id nil}
              (qe))
          "QueryExecution should be saved"))))

(deftest failure-test
  (let [query {:database 2, :type :query, :query {:source-table 26}}]
    (with-query-execution [qe query]
      (binding [qp.pipeline/*run* (fn [_query _rff]
                                    (throw (ex-info "Oops!" {:type qp.error-type/qp})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Oops!"
             (process-userland-query query))))
      (is (=? {:hash         "58af781ea2ba252ce3131462bdc7c54bc57538ed965d55beec62928ce8b32635"
               :database_id  2
               :error        "Oops!"
               :result_rows  0
               :started_at   #t "2020-02-04T12:22:00.000-08:00[US/Pacific]"
               :executor_id  nil
               :json_query   (dissoc (mt/userland-query query) :info)
               :native       false
               :pulse_id     nil
               :action_id    nil
               :card_id      nil
               :context      nil
               :running_time true
               :dashboard_id nil}
              (qe))
          "QueryExecution saved in the DB should have query execution info. empty `:data` should get added to failures"))))

(def ^:private ^:dynamic *viewlog-call-count* nil)

(methodical/defmethod events/publish-event! ::event
  [_topic _event]
  (when *viewlog-call-count*
    (swap! *viewlog-call-count* inc)))

(deftest ^:parallel viewlog-call-test
  (testing "no viewlog event with nil card id"
    (binding [*viewlog-call-count* (atom 0)]
      (process-userland-query {:database 2, :type :query, :query {:source-table 26}})
      (is (zero? @*viewlog-call-count*)))))

(deftest cancel-test
  (let [saved-query-execution? (atom false)]
    (with-redefs [process-userland-query/save-execution-metadata! (fn [info _field-usages]
                                                                    (reset! saved-query-execution? info))]
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (let [status (atom ::not-started)]
          (binding [qp.pipeline/*canceled-chan* canceled-chan
                    qp.pipeline/*reduce*        (fn [_rff _metadata rows]
                                                  (reset! status ::started)
                                                  (Thread/sleep 1000)
                                                  (reset! status ::done)
                                                  (qp.pipeline/*result* rows))]
            (future
              (let [futur (future
                            (process-userland-query (mt/mbql-query venues)))]
                (is (not= ::done
                          @status))
                (Thread/sleep 100)
                (future-cancel futur)))))
        (testing "canceled-chan should get get a :cancel message"
          (let [[val port] (a/alts!! [canceled-chan (a/timeout 500)])]
            (is (= 'canceled-chan
                   (if (= port canceled-chan) 'canceled-chan 'timeout))
                "port")
            (is (= ::qp.pipeline/cancel
                   val)
                "val")))
        (testing "No QueryExecution should get saved when a query is canceled"
          (is (not @saved-query-execution?)))))))

(deftest save-field-usage-test
  (testing "execute a query will save field usages"
    (qp.store/with-metadata-provider (mt/id)
      (doseq [query-type [:mbql :mlv2]]
        (let [;; randomize the binning so we can use it as the identifier for fieldusage down below
              random-binning  (rand-int 13371337)
              breakout-clause [:field (mt/id :products :price) {:binning {:num-bins  random-binning
                                                                          :strategy  :num-bins
                                                                          :bin-width random-binning}}]]
          (testing (format "with source card is a %s query" query-type)
            (mt/with-model-cleanup [:model/FieldUsage]
              (mt/with-temp [:model/Card card {:dataset_query (cond->> (mt/mbql-query products {:breakout [breakout-clause]})
                                                                (= :mlv2 query-type)
                                                                (lib/query (qp.store/metadata-provider)))}]
                (binding [process-userland-query/*save-execution-metadata-async* false]
                  (mt/user-http-request :crowberto :post 202 (format "card/%d/query" (:id card)))
                  (is (=? [{:filter_op                  nil
                            :breakout_temporal_unit     nil
                            :breakout_binning_strategy  :num-bins
                            :breakout_binning_bin_width random-binning
                            :breakout_binning_num_bins  random-binning
                            :used_in                    :breakout
                            :aggregation_function       nil
                            :field_id                   (mt/id :products :price)
                            :query_execution_id         (mt/malli=? pos-int?)}]
                          (t2/select :model/FieldUsage :breakout_binning_num_bins random-binning
                                     :breakout_binning_bin_width random-binning))))))))))))
