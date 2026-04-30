(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]))

(set! *warn-on-reflection* true)

(deftest throw-if-db-routing-enabled!-oss-test
  (testing "on OSS (no :database-routing premium feature) the check is a no-op"
    (mt/with-premium-features #{}
      (is (nil? (transforms-base.u/throw-if-db-routing-enabled!
                 {:name "OSS transform"}
                 (mt/db))))))
  (when config/ee-available?
    (testing "with :database-routing premium feature enabled, the check throws on a routing-enabled database"
      (mt/with-premium-features #{:database-routing}
        (mt/with-temp [:model/DatabaseRouter _ {:database_id    (mt/id)
                                                :user_attribute "db_name"}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #".*database routing turned on"
               (transforms-base.u/throw-if-db-routing-enabled!
                {:name "Routing transform"}
                (mt/db)))))))))

(deftest ^:parallel first-incremental-run?-test
  (testing "true for an incremental transform with no checkpoint yet"
    (is (true? (transforms-base.u/first-incremental-run?
                {:target {:type "table-incremental"} :last_checkpoint_value nil}))))
  (testing "false for an incremental transform that has already recorded a watermark"
    (is (false? (transforms-base.u/first-incremental-run?
                 {:target {:type "table-incremental"} :last_checkpoint_value "42"}))))
  (testing "false for non-incremental targets regardless of checkpoint value"
    (is (false? (transforms-base.u/first-incremental-run?
                 {:target {:type "table"} :last_checkpoint_value nil})))
    (is (false? (transforms-base.u/first-incremental-run?
                 {:target {:type :table} :last_checkpoint_value nil}))))
  (testing "accepts both string and keyword target types"
    (is (true? (transforms-base.u/first-incremental-run?
                {:target {:type :table-incremental} :last_checkpoint_value nil})))))

(deftest checkpoint-span-attrs-test
  (testing "nil source-range-params yields an empty attrs map"
    (is (= {} (transforms-base.u/checkpoint-span-attrs nil))))
  (testing "field-id only (no lo/hi) yields just :transform/checkpoint-field-id"
    (is (= {:transform/checkpoint-field-id 42}
           (transforms-base.u/checkpoint-span-attrs {:checkpoint-filter-field-id 42}))))
  (testing "numeric lo/hi are encoded as strings"
    (is (= {:transform/checkpoint-field-id 7
            :transform/checkpoint-lo       "10"
            :transform/checkpoint-hi       "100"}
           (transforms-base.u/checkpoint-span-attrs
            {:checkpoint-filter-field-id 7
             :lo {:value 10}
             :hi {:value 100}}))))
  (testing "temporal hi is formatted as an ISO string"
    (let [attrs (transforms-base.u/checkpoint-span-attrs
                 {:checkpoint-filter-field-id 9
                  :hi {:value (t/local-date-time 2024 1 16 10 0 0)}})]
      (is (= 9 (:transform/checkpoint-field-id attrs)))
      (is (string? (:transform/checkpoint-hi attrs)))
      (is (re-find #"2024-01-16" (:transform/checkpoint-hi attrs))))))

(deftest save-watermark!-emits-checkpoint-gauge-test
  (mt/with-prometheus-system! [_ system]
    (mt/with-temp [:model/Transform {transform-id :id} {}]
      (testing "numeric hi value emits the gauge keyed on transform-id and field-id"
        (transforms-base.u/save-watermark! transform-id
                                           {:checkpoint-filter-field-id 7
                                            :hi {:value 42}})
        (is (== 42.0
                (mt/metric-value system :metabase-transforms/checkpoint-value
                                 {:transform-id (str transform-id) :field-id "7"}))))
      (testing "temporal hi value emits epoch millis on the gauge"
        (let [t (t/instant "2024-01-16T10:00:00Z")]
          (transforms-base.u/save-watermark! transform-id
                                             {:checkpoint-filter-field-id 8
                                              :hi {:value t}})
          (is (== (double (.toEpochMilli t))
                  (mt/metric-value system :metabase-transforms/checkpoint-value
                                   {:transform-id (str transform-id) :field-id "8"})))))
      (testing "nil hi value does not emit the gauge"
        (transforms-base.u/save-watermark! transform-id
                                           {:checkpoint-filter-field-id 9
                                            :hi nil})
        (is (== 0
                (mt/metric-value system :metabase-transforms/checkpoint-value
                                 {:transform-id (str transform-id) :field-id "9"}))))
      (testing "nil source-range-params does not emit the gauge"
        (transforms-base.u/save-watermark! transform-id nil)
        (is (== 0
                (mt/metric-value system :metabase-transforms/checkpoint-value
                                 {:transform-id (str transform-id) :field-id "missing"})))))))
