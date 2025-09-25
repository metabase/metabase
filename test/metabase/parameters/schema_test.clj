(ns metabase.parameters.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.parameters.schema :as parameters.schema]
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
                              :value_field [:aggregation 0]}}))
  (testing "Successes"
    (are [v] (mr/validate ::parameters.schema/parameter v)
      {:id                   "param-id"
       :type                 "number"
       :values_source_type   "card"
       :values_source_config {:card_id     3
                              :value_field [:field 3 nil]
                              :label_field [:field "name" {:base-type :type/Float}]}}
      {:id                   "param-id"
       :type                 "number"
       :values_source_type   "static-list"
       :values_source_config {:values [[1 2 3]]}})))

(deftest ^:parallel parameter-mapping-test
  (testing "Failures"
    (are [v] (not (mr/validate ::parameters.schema/parameter-mapping v))
      {:parameter_id "param-id"}
      {:parameter_id "param-id"
       :target        [:field 3 nil]
       :card_id       "a"}))
  (testing "Successes"
    (are [v] (mr/validate ::parameters.schema/parameter-mapping v)
      {:parameter_id "param-id"
       :target        [:field 3 nil]
       :card_id       3})))
