(ns metabase.lib-metric.display-info-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib-metric.display-info :as display-info]))

(deftest default-display-info-test
  (testing "extracts common fields from entity"
    (let [entity {:name "test-name"
                  :display-name "Test Name"
                  :effective-type :type/Text
                  :semantic-type :type/Category
                  :description "A description"}
          result (display-info/default-display-info nil entity)]
      (is (= "Test Name" (:display-name result)))
      (is (= "test-name" (:name result)))
      (is (= :type/Text (:effective-type result)))
      (is (= :type/Category (:semantic-type result)))
      (is (= "A description" (:description result)))))

  (testing "uses name as display-name fallback"
    (let [entity {:name "fallback-name"}
          result (display-info/default-display-info nil entity)]
      (is (= "fallback-name" (:display-name result)))))

  (testing "handles selected and default flags"
    (let [entity {:name "test" :selected? true :default? false}
          result (display-info/default-display-info nil entity)]
      (is (true? (:selected result)))
      (is (false? (:default result)))))

  (testing "handles alternate selected/default keys"
    (let [entity {:name "test" :selected true :default true}
          result (display-info/default-display-info nil entity)]
      (is (true? (:selected result)))
      (is (true? (:default result))))))

(deftest display-info-method-metric-test
  (testing ":metadata/metric returns display-name"
    (let [metric {:lib/type :metadata/metric
                  :name "revenue"
                  :display-name "Total Revenue"}
          result (display-info/display-info nil metric)]
      (is (= "Total Revenue" (:display-name result)))
      (is (= "revenue" (:name result)))))

  (testing ":metadata/metric falls back to name"
    (let [metric {:lib/type :metadata/metric
                  :name "revenue"}
          result (display-info/display-info nil metric)]
      (is (= "revenue" (:display-name result)))))

  (testing ":metadata/metric has fallback for missing name"
    (let [metric {:lib/type :metadata/metric}
          result (display-info/display-info nil metric)]
      (is (string? (:display-name result))))))

(deftest display-info-method-measure-test
  (testing ":metadata/measure returns display-name"
    (let [measure {:lib/type :metadata/measure
                   :name "count"
                   :display-name "Count"}
          result (display-info/display-info nil measure)]
      (is (= "Count" (:display-name result)))
      (is (= "count" (:name result)))))

  (testing ":metadata/measure falls back to name"
    (let [measure {:lib/type :metadata/measure
                   :name "sum"}
          result (display-info/display-info nil measure)]
      (is (= "sum" (:display-name result))))))

(deftest display-info-method-dimension-test
  (testing ":metadata/dimension returns expected fields"
    (let [dimension {:lib/type :metadata/dimension
                     :name "category"
                     :display-name "Category"
                     :effective-type :type/Text
                     :semantic-type :type/Category
                     :filter-positions [0 1]
                     :projection-positions [2]}
          result (display-info/display-info nil dimension)]
      (is (= "Category" (:display-name result)))
      (is (= "category" (:name result)))
      (is (= :type/Text (:effective-type result)))
      (is (= :type/Category (:semantic-type result)))
      (is (= [0 1] (:filter-positions result)))
      (is (= [2] (:projection-positions result)))))

  (testing ":metadata/dimension defaults positions to empty vectors"
    (let [dimension {:lib/type :metadata/dimension
                     :name "test"}
          result (display-info/display-info nil dimension)]
      (is (= [] (:filter-positions result)))
      (is (= [] (:projection-positions result)))))

  (testing ":metadata/dimension includes source indicators"
    (let [join-dim {:lib/type :metadata/dimension
                    :name "join-col"
                    :lib/source :source/joins}
          expr-dim {:lib/type :metadata/dimension
                    :name "expr-col"
                    :lib/source :source/expressions}]
      (is (true? (:is-from-join (display-info/display-info nil join-dim))))
      (is (true? (:is-calculated (display-info/display-info nil expr-dim)))))))

(deftest display-info-method-temporal-bucket-test
  (testing ":temporal-bucket returns expected fields"
    (let [bucket {:lib/type :temporal-bucket
                  :unit :month
                  :default true
                  :selected false}
          result (display-info/display-info nil bucket)]
      (is (= "month" (:short-name result)))
      (is (string? (:display-name result)))
      (is (true? (:default result)))
      (is (false? (:selected result)))))

  (testing ":temporal-bucket identifies extraction units"
    (let [extraction {:lib/type :temporal-bucket
                      :unit :month-of-year}
          truncation {:lib/type :temporal-bucket
                      :unit :month}]
      (is (true? (:is-temporal-extraction (display-info/display-info nil extraction))))
      (is (not (:is-temporal-extraction (display-info/display-info nil truncation)))))))

;; TODO: Enable binning tests once schema dependencies (metabase.lib.schema.metadata,
;; metabase.legacy-mbql.schema) are properly loaded in test context.
;; The lib.binning/binning-display-name function requires these schemas to validate inputs.
#_(deftest display-info-method-binning-strategy-test
    (testing ":binning-strategy returns expected fields"
      (let [strategy {:lib/type :binning-strategy
                      :strategy :default
                      :default true
                      :selected false}
            result (display-info/display-info nil strategy)]
        (is (string? (:display-name result)))
        (is (true? (:default result)))
        (is (false? (:selected result))))))

(deftest display-info-method-default-test
  (testing "unknown types get default display-info"
    (let [unknown {:lib/type :unknown/type
                   :name "test"
                   :display-name "Test"}
          result (display-info/display-info nil unknown)]
      (is (= "Test" (:display-name result)))
      (is (= "test" (:name result))))))

(deftest display-info-filter-clause-test
  (testing "filter clause generates readable display-name with dimension UUID as fallback"
    (let [clause [:= {} [:dimension {} "dim-uuid"] "value"]
          result (display-info/display-info nil clause)]
      (is (= "dim-uuid is value" (:display-name result)))))

  (testing "contains filter clause"
    (let [clause [:contains {} [:dimension {} "dim-uuid"] "search"]
          result (display-info/display-info nil clause)]
      (is (= "dim-uuid contains search" (:display-name result)))))

  (testing "between filter clause"
    (let [clause [:between {} [:dimension {} "dim-uuid"] 1 10]
          result (display-info/display-info nil clause)]
      (is (= "dim-uuid is between 1 and 10" (:display-name result)))))

  (testing "unary operator (is-null)"
    (let [clause [:is-null {} [:dimension {} "dim-uuid"]]
          result (display-info/display-info nil clause)]
      (is (= "dim-uuid is empty" (:display-name result))))))
