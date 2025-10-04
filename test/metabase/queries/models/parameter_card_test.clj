(ns metabase.queries.models.parameter-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest ^:parallel validate-parameterized-object-type-test
  (testing "valid parameterized_object_type values are accepted"
    (is (nil? (#'parameter-card/validate-parameterized-object-type
               {:parameterized_object_type "dashboard"})))
    (is (nil? (#'parameter-card/validate-parameterized-object-type
               {:parameterized_object_type "card"})))))

(deftest ^:parallel validate-parameterized-object-type-test-2
  (testing "invalid parameterized_object_type throws exception"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"invalid parameterized_object_type"
         (#'parameter-card/validate-parameterized-object-type
          {:parameterized_object_type "invalid"})))))

(deftest delete-all-for-parameterized-object!-test
  (mt/with-temp [:model/Card {card-id :id} {}
                 :model/ParameterCard {pc1-id :id} {:parameterized_object_type "dashboard"
                                                    :parameterized_object_id   1
                                                    :parameter_id              "param1"
                                                    :card_id                   card-id}
                 :model/ParameterCard {pc2-id :id} {:parameterized_object_type "dashboard"
                                                    :parameterized_object_id   1
                                                    :parameter_id              "param2"
                                                    :card_id                   card-id}
                 :model/ParameterCard {pc3-id :id} {:parameterized_object_type "dashboard"
                                                    :parameterized_object_id   2
                                                    :parameter_id              "param3"
                                                    :card_id                   card-id}]
    (testing "deletes all ParameterCards for given object when no exclusions"
      (parameter-card/delete-all-for-parameterized-object! "dashboard" 1)
      (is (nil? (t2/select-one :model/ParameterCard :id pc1-id)))
      (is (nil? (t2/select-one :model/ParameterCard :id pc2-id)))
      (is (some? (t2/select-one :model/ParameterCard :id pc3-id))))
    (testing "preserves ParameterCards with parameter IDs still in use"
      (parameter-card/delete-all-for-parameterized-object! "dashboard" 2 ["param3"])
      (is (some? (t2/select-one :model/ParameterCard :id pc3-id))))))

(deftest upsert-from-parameters!-insert-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Card {card-id-1 :id} {:database_id db-id}
                 :model/Card {card-id-2 :id} {:database_id db-id}]
    (testing "creates new ParameterCards for parameters with card sources"
      (let [parameters [{:id                   "param1"
                         :values_source_type   "card"
                         :values_source_config {:card_id card-id-1}}
                        {:id                   "param2"
                         :values_source_type   "card"
                         :values_source_config {:card_id card-id-2}}]]
        (#'parameter-card/upsert-from-parameters! "dashboard" 1 parameters)
        (let [pc1 (t2/select-one :model/ParameterCard
                                 :parameterized_object_type "dashboard"
                                 :parameterized_object_id 1
                                 :parameter_id "param1")
              pc2 (t2/select-one :model/ParameterCard
                                 :parameterized_object_type "dashboard"
                                 :parameterized_object_id 1
                                 :parameter_id "param2")]
          (is (= card-id-1 (:card_id pc1)))
          (is (= card-id-2 (:card_id pc2))))))))

(deftest upsert-from-parameters!-update-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Card {card-id-1 :id} {:database_id db-id}
                 :model/Card {card-id-2 :id} {:database_id db-id}
                 :model/ParameterCard _ {:parameterized_object_type "dashboard"
                                         :parameterized_object_id   1
                                         :parameter_id              "param1"
                                         :card_id                   card-id-1}]
    (testing "does not error when no updates to existing ParameterCard"
      (let [parameters [{:id                   "param1"
                         :values_source_type   "card"
                         :values_source_config {:card_id card-id-1}}]]
        ;; test that we ran without throwing
        (is (nil? (#'parameter-card/upsert-from-parameters! "dashboard" 1 parameters)))))
    (testing "updates existing ParameterCard"
      (let [parameters [{:id                   "param1"
                         :values_source_type   "card"
                         :values_source_config {:card_id card-id-2}}]]
        (#'parameter-card/upsert-from-parameters! "dashboard" 1 parameters)
        (let [pc (t2/select-one :model/ParameterCard
                                :parameterized_object_type "dashboard"
                                :parameterized_object_id 1
                                :parameter_id "param1")]
          (is (= card-id-2 (:card_id pc))))))))

(deftest upsert-or-delete-from-parameters!-test
  (mt/with-temp [:model/Card {card-id-1 :id} {}
                 :model/Card {card-id-2 :id} {}
                 :model/Card {card-id-3 :id} {}]
    (testing "creates ParameterCards for valid card-sourced parameters"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-1}}
                        {:id                   "param2"
                         :type                 :number
                         :values_source_type   :static-list
                         :values_source_config {:values ["a" "b" "c"]}}
                        {:id                   "param3"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-2}}]]
        (parameter-card/upsert-or-delete-from-parameters! "dashboard" 1 parameters)
        (let [pcs (t2/select :model/ParameterCard
                             :parameterized_object_type "dashboard"
                             :parameterized_object_id 1)]
          (is (= 2 (count pcs)))
          (is (some #(and (= "param1" (:parameter_id %))
                          (= card-id-1 (:card_id %))) pcs))
          (is (some #(and (= "param3" (:parameter_id %))
                          (= card-id-2 (:card_id %))) pcs))
          (is (not (some #(= "param2" (:parameter_id %)) pcs))))))
    (testing "deletes ParameterCards no longer in use"
      (mt/with-temp [:model/ParameterCard _ {:parameterized_object_type "dashboard"
                                             :parameterized_object_id   1
                                             :parameter_id              "old-param"
                                             :card_id                   card-id-3}]
        (let [parameters [{:id                   "param1"
                           :type                 :number
                           :values_source_type   :card
                           :values_source_config {:card_id card-id-1}}]]
          (parameter-card/upsert-or-delete-from-parameters! "dashboard" 1 parameters)
          (let [pcs (t2/select :model/ParameterCard
                               :parameterized_object_type "dashboard"
                               :parameterized_object_id 1)]
            (is (= 1 (count pcs)))
            (is (= "param1" (:parameter_id (first pcs))))
            (is (= card-id-1 (:card_id (first pcs))))))))
    (testing "handles nil parameters gracefully"
      (parameter-card/upsert-or-delete-from-parameters! "dashboard" 1 nil)
      (is (not (t2/exists? :model/ParameterCard
                           :parameterized_object_type "dashboard"
                           :parameterized_object_id 1))))
    (testing "handles empty parameters list"
      (parameter-card/upsert-or-delete-from-parameters! "dashboard" 1 [])
      (is (not (t2/exists? :model/ParameterCard
                           :parameterized_object_type "dashboard"
                           :parameterized_object_id 1))))
    (testing "parameters without required fields"
      (let [parameters [{:id                   "param1"
                         :type                 :test
                         :values_source_type   "card"
                         :values_source_config {:card_id card-id-1}}
                        {:id                   "param2"
                         :type                 :test
                         :values_source_type   "card"
                         :values_source_config {}} ; missing card_id
                        {:id                   "param3"
                         :values_source_config {:card_id card-id-2}} ; missing values_source_type
                        {:values_source_type   "card"
                         :values_source_config {:card_id card-id-3}}]]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid input:"
             (parameter-card/upsert-or-delete-from-parameters! "dashboard" 1 parameters)))))
    (testing "works with card parameterized objects"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-1}}]]
        (parameter-card/upsert-or-delete-from-parameters! "card" 1 parameters)
        (let [pcs (t2/select :model/ParameterCard
                             :parameterized_object_type "card"
                             :parameterized_object_id 1)]
          (is (= 1 (count pcs)))
          (is (= "param1" (:parameter_id (first pcs))))
          (is (= card-id-1 (:card_id (first pcs)))))))))

(deftest model-validation-test
  (mt/with-temp [:model/Card {card-id :id} {}]
    (testing "ParameterCard creation with valid parameterized_object_type"
      (is (some? (t2/insert! :model/ParameterCard
                             {:parameterized_object_type "dashboard"
                              :parameterized_object_id   1
                              :parameter_id              "param1"
                              :card_id                   card-id})))
      (is (some? (t2/insert! :model/ParameterCard
                             {:parameterized_object_type "card"
                              :parameterized_object_id   1
                              :parameter_id              "param2"
                              :card_id                   card-id}))))
    (testing "ParameterCard creation with invalid parameterized_object_type throws exception"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"invalid parameterized_object_type"
           (t2/insert! :model/ParameterCard
                       {:parameterized_object_type "invalid"
                        :parameterized_object_id   1
                        :parameter_id              "param1"
                        :card_id                   card-id}))))
    (testing "ParameterCard update with invalid parameterized_object_type throws exception"
      (mt/with-temp [:model/ParameterCard {pc-id :id} {:parameterized_object_type "dashboard"
                                                       :parameterized_object_id   1
                                                       :parameter_id              "param3"
                                                       :card_id                   card-id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"invalid parameterized_object_type"
             (t2/update! :model/ParameterCard pc-id {:parameterized_object_type "invalid"})))))))
