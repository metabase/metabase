(ns metabase.queries.models.parameter-card-test
  (:require
   [clojure.test :refer :all]
   [metabase.queries.models.parameter-card :as parameter-card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest sync-parameter-cards!-insert-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Card {card-id-1 :id} {:database_id db-id}
                 :model/Card {card-id-2 :id} {:database_id db-id}]
    (testing "creates new ParameterCards for parameters with card sources"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-1}}
                        {:id                   "param2"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-2}}]]
        (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])
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

(deftest sync-parameter-cards!-update-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Card {card-id-1 :id} {:database_id db-id}
                 :model/Card {card-id-2 :id} {:database_id db-id}
                 :model/ParameterCard _ {:parameterized_object_type "dashboard"
                                         :parameterized_object_id   1
                                         :parameter_id              "param1"
                                         :card_id                   card-id-1}]
    (testing "does not error when no updates to existing ParameterCard"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-1}}]]
        ;; test that we ran without throwing
        (is (nil? (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])))))
    (testing "updates existing ParameterCard"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-2}}]]
        (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])
        (let [pc (t2/select-one :model/ParameterCard
                                :parameterized_object_type "dashboard"
                                :parameterized_object_id 1
                                :parameter_id "param1")]
          (is (= card-id-2 (:card_id pc))))))))

(deftest sync-parameter-cards!-test
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
        (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])
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
          (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])
          (let [pcs (t2/select :model/ParameterCard
                               :parameterized_object_type "dashboard"
                               :parameterized_object_id 1)]
            (is (= 1 (count pcs)))
            (is (= "param1" (:parameter_id (first pcs))))
            (is (= card-id-1 (:card_id (first pcs))))))))
    (testing "handles nil parameters gracefully"
      (parameter-card/sync-parameter-cards! "dashboard" [[1 nil]])
      (is (not (t2/exists? :model/ParameterCard
                           :parameterized_object_type "dashboard"
                           :parameterized_object_id 1))))
    (testing "handles empty parameters list"
      (parameter-card/sync-parameter-cards! "dashboard" [[1 []]])
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
             (parameter-card/sync-parameter-cards! "dashboard" [[1 parameters]])))))
    (testing "works with card parameterized objects"
      (let [parameters [{:id                   "param1"
                         :type                 :number
                         :values_source_type   :card
                         :values_source_config {:card_id card-id-1}}]]
        (parameter-card/sync-parameter-cards! "card" [[1 parameters]])
        (let [pcs (t2/select :model/ParameterCard
                             :parameterized_object_type "card"
                             :parameterized_object_id 1)]
          (is (= 1 (count pcs)))
          (is (= "param1" (:parameter_id (first pcs))))
          (is (= card-id-1 (:card_id (first pcs)))))))))

(deftest model-insert-test
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
                              :card_id                   card-id}))))))
