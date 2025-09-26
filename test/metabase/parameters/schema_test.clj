(ns metabase.parameters.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel parameter-test
  (testing "Failures"
    (are [v] (not (mr/validate ::parameters.schema/parameter v))
      {:id   "param-id"
       :name "param-name"}
      {:id                   "param-id"
       :type                 "number"
       :values_source_type   "invalid-type"
       :values_source_config {:values [[1 2 3]]}}
      {:id                   "param-id"
       :type                 "number"
       :values_source_type   "card"
       :values_source_config {:card_id     3
                              :value_field [:aggregation 0]}})))

(deftest ^:parallel parameter-test-2
  (testing "Successes"
    (are [v] (mr/validate ::parameters.schema/parameter v)
      {:id                   "param-id"
       :type                 :number
       :values_source_type   :card
       :values_source_config {:card_id     3
                              :value_field [:field 3 nil]
                              :label_field [:field "name" {:base-type :type/Float}]}}
      {:id                   "param-id"
       :type                 :number
       :values_source_type   :static-list
       :values_source_config {:values [[1 2 3]]}})))

(deftest ^:parallel parameter-mapping-test
  (testing "Failures"
    (are [v] (not (mr/validate ::parameters.schema/parameter-mapping v))
      {:parameter_id "param-id"}
      {:parameter_id "param-id"
       :target        [:field 3 nil]
       :card_id       "a"})))

(deftest ^:parallel parameter-mapping-test-2
  (testing "Successes"
    (are [v] (mr/validate ::parameters.schema/parameter-mapping v)
      {:parameter_id "param-id"
       :target        [:field 3 nil]
       :card_id       3})))

(deftest ^:parallel normalize-parameter-mappings-test
  (testing "make sure parameter mappings correctly normalize things like legacy MBQL clauses"
    (is (= [{:parameter_id "wow"
             :target       [:dimension [:field 30 {:source-field 23}]]}]
           ((:out parameters.schema/transform-parameter-mappings)
            (json/encode
             [{:parameter_id "wow"
               :target       [:dimension [:fk-> 23 30]]}]))))))

(deftest ^:parallel normalize-parameter-mappings-test-2
  (testing "make sure parameter mappings correctly normalize things like legacy MBQL clauses"
    (testing "...but parameter mappings we should not normalize things like :target"
      (is (= [{:parameter_id "wow", :card-id 123, :hash "abc", :target [:dimension [:template-tag "foo"]]}]
             ((:out parameters.schema/transform-parameter-mappings)
              (json/encode
               [{:parameter_id "wow", :card-id 123, :hash "abc", :target [:dimension [:template-tag "foo"]]}])))))))

(deftest ^:parallel keep-empty-parameter-mappings-empty-test
  (testing (str "we should keep empty parameter mappings as empty instead of making them nil (if `normalize` removes "
                "them because they are empty) (I think this is to prevent NPEs on the FE? Not sure why we do this)")
    (is (= []
           ((:out parameters.schema/transform-parameter-mappings)
            (json/encode []))))))

(deftest ^:parallel normalize-card-parameter-mappings-test
  (doseq [parameters [[]
                      [{:name           "Time grouping"
                        :slug           "time_grouping"
                        :id             "8e366c15"
                        :type           :temporal-unit
                        :sectionId      "temporal-unit"
                        :temporal_units [:minute :quarter-of-year]}]]]
    (is (= parameters
           ((:out parameters.schema/transform-parameters)
            (json/encode parameters))))))
