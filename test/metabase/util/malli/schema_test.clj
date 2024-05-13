(ns metabase.util.malli.schema-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.util.malli.schema :as ms]))

(deftest ^:parallel schema-test
  (doseq [{:keys [schema failed-cases success-cases]}
          [{:schema        ms/NonBlankString
            :failed-cases  ["" 1]
            :success-cases ["a thing"]}
           {:schema        ms/IntGreaterThanOrEqualToZero
            :failed-cases  ["1" -1 1.5]
            :success-cases [0 1]}
           {:schema        ms/PositiveInt
            :failed-cases  ["1" 0 1.5]
            :success-cases [1 2]}
           {:schema        ms/PositiveNum
            :failed-cases  [0 "1"]
            :success-cases [1.5 2]}
           {:schema        ms/KeywordOrString
            :failed-cases  [1 [1] {:a 1}]
            :success-cases [:a "a"]}
           {:schema        ms/FieldType
            :failed-cases  [:type/invalid :Semantic/*]
            :success-cases [:type/Float]}
           {:schema        ms/FieldSemanticType
            :failed-cases  [:Semantic/invalid :type/Float]
            :success-cases [:type/Category]}
           {:schema        ms/FieldRelationType
            :failed-cases  [:Relation/invalid :type/Category :type/Float]
            :success-cases [:type/FK]}
           {:schema        ms/FieldSemanticOrRelationType
            :failed-cases  [:Relation/invalid :type/Float]
            :success-cases [:type/FK :type/Category]}
           {:schema        ms/CoercionStrategy
            :failed-cases  [:type/Category :type/Float]
            :success-cases [:Coercion/ISO8601->Date]}
           {:schema        ms/FieldTypeKeywordOrString
            :failed-cases  [1 :type/FK]
            :success-cases [:type/Float "type/Float"]}
           {:schema        ms/FieldSemanticTypeKeywordOrString
            :failed-cases  [1 :type/FK]
            :success-cases [:type/Category "type/Category"]}
           {:schema        ms/LegacyFieldOrExpressionReference
            :failed-cases  [[:aggregation 0] [:field "name" {}]]
            :success-cases [[:field 3 nil] ["field" "name" {:base-type :type/Float}]]}
           {:schema        ms/Map
            :failed-cases  [[] 1 "a"]
            :success-cases [{} {:a :b}]}
           {:schema        ms/Email
            :failed-cases  ["abc.com" 1]
            :success-cases ["ngoc@metabase.com"]}
           {:schema        ms/ValidPassword
            :failed-cases  ["abc.com" 1 "PASSW0RD"]
            :success-cases ["unc0mmonpw"]}
           {:schema        ms/IntString
            :failed-cases  [:a "a" "1.5"]
            :success-cases ["1"]}
           {:schema        ms/TemporalString
            :failed-cases  ["random string"]
            :success-cases ["2019-10-28T13:14:15" "2019-10-28"]}
           {:schema        ms/JSONString
            :failed-cases  ["string"]
            :success-cases ["{\"a\": 1}"]}
           {:schema        ms/EmbeddingParams
            :failed-cases  [{:key "value"}]
            :success-cases [{:key "disabled"}]}
           {:schema        ms/ValidLocale
            :failed-cases  ["locale"]
            :success-cases ["en" "es"]}
           {:schema        ms/NanoIdString
            :failed-cases  ["random"]
            :success-cases ["FReCLx5hSWTBU7kjCWfuu"]}
           {:schema        ms/UUIDString
            :failed-cases  ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
            :success-cases ["84a51d43-2d29-4c2c-8484-e51eb5af2ca4"]}
           {:schema        ms/Parameter
            :failed-cases  [{:id   "param-id"
                             :name "param-name"}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "invalid-type"
                             :values_source_config {:values [[1 2 3]]}}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "card"
                             :values_source_config {:card_id     3
                                                    :value_field [:aggregation 0]}}]
            :success-cases [{:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "card"
                             :values_source_config {:card_id     3
                                                    :value_field [:field 3 nil]
                                                    :label_field [:field "name" {:base-type :type/Float}]}}
                            {:id                   "param-id"
                             :type                 "number"
                             :values_source_type   "static-list"
                             :values_source_config {:values [[1 2 3]]}}]}
           {:schema        ms/ParameterMapping
            :failed-cases  [{:parameter_id "param-id"}
                            {:parameter_id "param-id"
                             :target        [:field 3 nil]
                             :card_id       "a"}]
            :success-cases [{:parameter_id "param-id"
                             :target        [:field 3 nil]
                             :card_id       3}]}]]

   (testing (format "schema %s" (pr-str schema))
    (doseq [case failed-cases]
      (testing (format "case: %s should fail" (pr-str case))
        (is (false? (mc/validate schema case)))))

    (doseq [case success-cases]
      (testing (format "case: %s should success" (pr-str case))
       (is (true? (mc/validate schema case))))))))
