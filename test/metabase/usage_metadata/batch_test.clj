(ns metabase.usage-metadata.batch-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.lib-be.hash :as lib-be.hash]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.batch :as usage-metadata.batch]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.settings :as usage-metadata.settings]
   [metabase.usage-metadata.store :as usage-metadata.store]
   [metabase.warehouse-schema.models.field]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private execution-defaults
  {:running_time 1
   :result_rows  1
   :native       false
   :executor_id  nil
   :card_id      nil
   :context      :ad-hoc})

(defn- orders-query []
  (mt/mbql-query orders
    {:filter      [:= $orders.product_id 1]
     :aggregation [[:sum $orders.subtotal]]
     :breakout    [!month.orders.created_at
                   $orders.user_id]}))

(defn- cross-source-query []
  (mt/mbql-query venues
    {:joins   [{:source-table $$categories
                :alias        "Cat"
                :condition    [:= $venues.category_id [:field %categories.id {:join-alias "Cat"}]]}]
     :filter  [:= $venues.category_id [:field %categories.id {:join-alias "Cat"}]]
     :breakout [$venues.price]}))

(defn- native-query []
  {:database (mt/id)
   :type     :native
   :native   {:query "SELECT 1"}})

(defn- insert-query! [query-hash query]
  (t2/insert! :model/Query
              {:query_hash             query-hash
               :query                  query
               :average_execution_time 1}))

(defn- insert-query-execution! [query-hash started-at]
  (t2/insert-returning-instances! :model/QueryExecution
                                  (assoc execution-defaults
                                         :hash query-hash
                                         :started_at started-at)))

(defn- delete-query! [query-hash]
  (t2/delete! :model/Query :query_hash query-hash))

(defn- delete-day! [bucket-date]
  (usage-metadata.store/delete-day! bucket-date))

(defn- delete-query-executions-for-day! [bucket-date]
  (t2/delete! :model/QueryExecution
              {:where [:and
                       [:>= :started_at (t/offset-date-time bucket-date (t/local-time 0) (t/zone-offset "Z"))]
                       [:< :started_at (t/offset-date-time (t/plus bucket-date (t/days 1)) (t/local-time 0) (t/zone-offset "Z"))]]}))

(deftest target-days-test
  (is (= [(t/local-date "2026-04-13")
          (t/local-date "2026-04-14")]
         (usage-metadata.batch/target-days
          {:last-completed-day (t/local-date "2026-04-12")
           :retention-days     90
           :yesterday          (t/local-date "2026-04-14")})))
  (is (= [(t/local-date "2026-04-13")
          (t/local-date "2026-04-14")]
         (usage-metadata.batch/target-days
          {:last-completed-day nil
           :retention-days     2
           :yesterday          (t/local-date "2026-04-14")})))
  (is (= [(t/local-date "2026-04-13")
          (t/local-date "2026-04-14")]
         (usage-metadata.batch/target-days
          {:last-completed-day (t/local-date "2026-04-01")
           :retention-days     2
           :yesterday          (t/local-date "2026-04-14")}))))

(deftest process-day!-integration-test
  (let [bucket-date   (t/local-date "2026-04-13")
        valid-query   (orders-query)
        query-hash    (lib-be.hash/query-hash valid-query)
        execution-at  (t/offset-date-time "2026-04-13T12:00Z")
        user-id-field (mt/id :orders :user_id)
        original-fp   (t2/select-one-fn :fingerprint :model/Field :id user-id-field)]
    (try
      (delete-query-executions-for-day! bucket-date)
      (delete-day! bucket-date)
      (t2/update! :model/Field :id user-id-field {:fingerprint {:global {:distinct-count 1, :nil% 0.0}}})
      (insert-query! query-hash valid-query)
      (insert-query-execution! query-hash execution-at)
      (insert-query-execution! query-hash (t/offset-date-time "2026-04-13T13:00Z"))
      (let [result (usage-metadata.batch/process-day! bucket-date)]
        (is (= {} (:skipped-rows result)))
        (is (= 2 (:query-execution-rows result)))
        (is (= 2 (:joined-rows result)))
        (is (= 2 (:segment-tuples result)))
        (is (= 2 (:metric-tuples result)))
        (is (= 4 (:dimension-tuples result)))
        (is (= 1 (:profile-observations result)))
        (is (= 1 (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)))
        (is (= 1 (t2/count :model/SourceMetricDaily :bucket_date bucket-date)))
        (is (= 2 (t2/count :model/SourceDimensionDaily :bucket_date bucket-date)))
        (is (= 1 (t2/count :model/SourceDimensionProfileDaily :bucket_date bucket-date)))
        (is (= :fingerprint
               (t2/select-one-fn :source_basis :model/SourceDimensionProfileDaily :bucket_date bucket-date)))
        (is (= :single-value
               (t2/select-one-fn :observation_type :model/SourceDimensionProfileDaily :bucket_date bucket-date)))
        (is (= "2026-04-13"
               (usage-metadata.settings/usage-metadata-last-completed-day))))
      (finally
        (t2/update! :model/Field :id user-id-field {:fingerprint original-fp})
        (delete-query! query-hash)
        (delete-query-executions-for-day! bucket-date)
        (delete-day! bucket-date)))))

(deftest process-day!-cross-source-predicate-test
  (let [bucket-date  (t/local-date "2026-04-13")
        valid-query  (cross-source-query)
        query-hash   (lib-be.hash/query-hash valid-query)
        execution-at (t/offset-date-time "2026-04-13T12:00Z")]
    (try
      (delete-query-executions-for-day! bucket-date)
      (delete-day! bucket-date)
      (insert-query! query-hash valid-query)
      (insert-query-execution! query-hash execution-at)
      (usage-metadata.batch/process-day! bucket-date)
      (is (= #{:mixed :projected}
             (t2/select-fn-set :ownership_mode :model/SourceSegmentDaily :bucket_date bucket-date)))
      (is (= 3 (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)))
      (finally
        (delete-query! query-hash)
        (delete-query-executions-for-day! bucket-date)
        (delete-day! bucket-date)))))

(deftest reprocess-day!-does-not-advance-watermark-test
  (let [bucket-date  (t/local-date "2026-04-13")
        valid-query  (orders-query)
        query-hash   (lib-be.hash/query-hash valid-query)
        execution-at (t/offset-date-time "2026-04-13T12:00Z")]
    (try
      (delete-query-executions-for-day! bucket-date)
      (delete-day! bucket-date)
      (insert-query! query-hash valid-query)
      (insert-query-execution! query-hash execution-at)
      (mt/with-temporary-setting-values [usage-metadata-last-completed-day "2026-04-12"]
        (let [result (usage-metadata.batch/reprocess-day! bucket-date)]
          (is (false? (:watermark-advanced? result)))
          (is (= "2026-04-12"
                 (usage-metadata.settings/usage-metadata-last-completed-day)))
          (is (= 1 (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)))))
      (finally
        (delete-query! query-hash)
        (delete-query-executions-for-day! bucket-date)
        (delete-day! bucket-date)))))

(deftest run-batch!-integration-test
  (let [day-a            (t/local-date "2026-04-13")
        day-b            (t/local-date "2026-04-14")
        old-day          (t/local-date "2026-04-10")
        valid-query      (orders-query)
        valid-hash       (lib-be.hash/query-hash valid-query)
        native-hash      (lib-be.hash/query-hash (native-query))
        missing-hash     (.getBytes "missing-query" StandardCharsets/UTF_8)
        unsupported-hash (.getBytes "unsupported-query" StandardCharsets/UTF_8)]
    (try
      (doseq [day [day-a day-b old-day]]
        (delete-query-executions-for-day! day)
        (delete-day! day))
      (insert-query! valid-hash valid-query)
      (insert-query! native-hash (native-query))
      (insert-query! unsupported-hash {})
      (insert-query-execution! valid-hash (t/offset-date-time "2026-04-13T12:00Z"))
      (insert-query-execution! valid-hash (t/offset-date-time "2026-04-14T12:00Z"))
      (insert-query-execution! native-hash (t/offset-date-time "2026-04-14T13:00Z"))
      (insert-query-execution! missing-hash (t/offset-date-time "2026-04-14T14:00Z"))
      (insert-query-execution! unsupported-hash (t/offset-date-time "2026-04-14T15:00Z"))
      (t2/insert! :model/SourceSegmentDaily
                  {:source_type :table
                   :source_id   1
                   :ownership_mode :direct
                   :field_id    1
                   :predicate   "old"
                   :bucket_date old-day
                   :count       1})
      (mt/with-temporary-setting-values [usage-metadata-last-completed-day nil
                                         usage-metadata-retention-days     2]
        (let [summary (usage-metadata.batch/run-batch!
                       {:today              (t/local-date "2026-04-15")
                        :last-completed-day nil
                        :retention-days     2})]
          (is (= :success (:status summary)))
          (is (= 2 (:days-processed summary)))
          (is (= 5 (:query-execution-rows summary)))
          (is (= 4 (:joined-rows summary)))
          (is (= 1 (get-in summary [:skipped-rows :missing-query])))
          (is (= 1 (get-in summary [:skipped-rows :unsupported-query])))
          (is (= 1
                 (t2/count :model/SourceSegmentDaily :bucket_date day-a)))
          (is (= 1
                 (t2/count :model/SourceSegmentDaily :bucket_date day-b)))
          (is (= 0
                 (t2/count :model/SourceSegmentDaily :bucket_date old-day)))
          (is (= "2026-04-14"
                 (usage-metadata.settings/usage-metadata-last-completed-day)))))
      (finally
        (delete-query! valid-hash)
        (delete-query! native-hash)
        (delete-query! unsupported-hash)
        (doseq [day [day-a day-b old-day]]
          (delete-query-executions-for-day! day)
          (delete-day! day))))))

(deftest run-batch!-retention-runs-even-on-failure-test
  (let [day-a       (t/local-date "2026-04-13")
        day-b       (t/local-date "2026-04-14")
        old-day     (t/local-date "2026-04-10")
        valid-query (orders-query)
        query-hash  (lib-be.hash/query-hash valid-query)
        original    usage-metadata.store/replace-day!]
    (try
      (doseq [day [day-a day-b old-day]]
        (delete-query-executions-for-day! day)
        (delete-day! day))
      (insert-query! query-hash valid-query)
      (insert-query-execution! query-hash (t/offset-date-time "2026-04-13T12:00Z"))
      (insert-query-execution! query-hash (t/offset-date-time "2026-04-14T12:00Z"))
      (t2/insert! :model/SourceSegmentDaily
                  {:source_type    :table
                   :source_id      1
                   :ownership_mode :direct
                   :field_id       1
                   :predicate      "old"
                   :bucket_date    old-day
                   :count          1})
      (mt/with-temporary-setting-values [usage-metadata-last-completed-day nil
                                         usage-metadata-retention-days     2]
        (with-redefs [usage-metadata.store/replace-day! (fn [bucket-date payload]
                                                          (if (= bucket-date day-b)
                                                            (throw (ex-info "boom" {:bucket-date bucket-date}))
                                                            (original bucket-date payload)))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                                (usage-metadata.batch/run-batch!
                                 {:today              (t/local-date "2026-04-15")
                                  :last-completed-day nil
                                  :retention-days     2})))
          (testing "retention cleanup runs even when the processing loop fails"
            (is (= 0 (t2/count :model/SourceSegmentDaily :bucket_date old-day))))))
      (finally
        (delete-query! query-hash)
        (doseq [day [day-a day-b old-day]]
          (delete-query-executions-for-day! day)
          (delete-day! day))))))

(deftest run-batch!-stops-on-day-failure-test
  (let [day-a       (t/local-date "2026-04-13")
        day-b       (t/local-date "2026-04-14")
        valid-query (orders-query)
        query-hash  (lib-be.hash/query-hash valid-query)
        original    usage-metadata.store/replace-day!]
    (try
      (doseq [day [day-a day-b]]
        (delete-query-executions-for-day! day)
        (delete-day! day))
      (insert-query! query-hash valid-query)
      (insert-query-execution! query-hash (t/offset-date-time "2026-04-13T12:00Z"))
      (insert-query-execution! query-hash (t/offset-date-time "2026-04-14T12:00Z"))
      (mt/with-temporary-setting-values [usage-metadata-last-completed-day nil
                                         usage-metadata-retention-days     2]
        (with-redefs [usage-metadata.store/replace-day! (fn [bucket-date payload]
                                                          (if (= bucket-date day-b)
                                                            (throw (ex-info "boom" {:bucket-date bucket-date}))
                                                            (original bucket-date payload)))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                                (usage-metadata.batch/run-batch!
                                 {:today              (t/local-date "2026-04-15")
                                  :last-completed-day nil
                                  :retention-days     2})))
          (is (= 1 (t2/count :model/SourceSegmentDaily :bucket_date day-a)))
          (is (= 0 (t2/count :model/SourceSegmentDaily :bucket_date day-b)))
          (is (= "2026-04-13"
                 (usage-metadata.settings/usage-metadata-last-completed-day)))))
      (finally
        (delete-query! query-hash)
        (doseq [day [day-a day-b]]
          (delete-query-executions-for-day! day)
          (delete-day! day))))))
