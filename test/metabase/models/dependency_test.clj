(ns metabase.models.dependency-test
  (:require [clojure.test :refer :all]
            [metabase.models.dependency :as dep :refer [Dependency]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]
            [toucan.models :as models]))

(use-fixtures :once (fixtures/initialize :db))

(models/defmodel ^:private Mock :mock)

(extend (class Mock)
  dep/IDependent
  {:dependencies
   (constantly
    {:a [1 2]
     :b [3 4 5]})})

(deftest dependencies-test
  (is (= {:a [1 2]
          :b [3 4 5]}
         (dep/dependencies Mock 7 {}))))

(defn format-dependencies [deps]
  (->> deps
       (map #(into {} %))
       (map #(dissoc % :id :created_at))
       set))

(deftest retrieve-dependencies-test
  (testing "retrieve-dependencies"
    (mt/with-temp* [Dependency [_ {:model              "Mock"
                                   :model_id           4
                                   :dependent_on_model "test"
                                   :dependent_on_id    1
                                   :created_at         :%now}]
                    Dependency [_ {:model              "Mock"
                                   :model_id           4
                                   :dependent_on_model "foobar"
                                   :dependent_on_id    13
                                   :created_at         :%now}]]
      (is (= #{{:model              "Mock"
                :model_id           4
                :dependent_on_model "test"
                :dependent_on_id    1}
               {:model              "Mock"
                :model_id           4
                :dependent_on_model "foobar"
                :dependent_on_id    13}}
             (format-dependencies (dep/retrieve-dependencies Mock 4)))))))

(deftest update-dependencies!-test
  (testing "we skip over values which aren't integers"
    (mt/with-model-cleanup [Dependency]
      (dep/update-dependencies! Mock 2 {:test ["a" "b" "c"]})
      (is (= #{}
             (set (db/select Dependency, :model "Mock", :model_id 2))))))

  (testing "valid working dependencies list"
    (mt/with-model-cleanup [Dependency]
      (dep/update-dependencies! Mock 7 {:test [1 2 3]})
      (is (= #{{:model              "Mock"
                :model_id           7
                :dependent_on_model "test"
                :dependent_on_id    1}
               {:model              "Mock"
                :model_id           7
                :dependent_on_model "test"
                :dependent_on_id    2}
               {:model              "Mock"
                :model_id           7
                :dependent_on_model "test"
                :dependent_on_id    3}}
             (format-dependencies (db/select Dependency, :model "Mock", :model_id 7))))))

  (testing "delete dependencies that are no longer in the list"
    (mt/with-temp Dependency [_ {:model              "Mock"
                                 :model_id           1
                                 :dependent_on_model "test"
                                 :dependent_on_id    5
                                 :created_at         :%now}]
      (mt/with-model-cleanup [Dependency]
        (dep/update-dependencies! Mock 1 {:test [1 2]})
        (is (= #{{:model              "Mock"
                  :model_id           1
                  :dependent_on_model "test"
                  :dependent_on_id    1}
                 {:model              "Mock"
                  :model_id           1
                  :dependent_on_model "test"
                  :dependent_on_id    2}}
               (format-dependencies (db/select Dependency, :model "Mock", :model_id 1))))))))
