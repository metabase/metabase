(ns metabase.models.dependency-test
  (:require [clojure.test :refer :all]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.database :refer [Database]]
            [metabase.models.dependency :as dependency :refer [Dependency]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]
            [toucan.models :as models]))

(use-fixtures :once (fixtures/initialize :db))

(models/defmodel ^:private Mock :mock)

(extend (class Mock)
  dependency/IDependent
  {:dependencies
   (constantly
    {:a [1 2]
     :b [3 4 5]})})

(deftest dependencies-test
  (is (= {:a [1 2]
          :b [3 4 5]}
         (dependency/dependencies Mock 7 {}))))

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
             (format-dependencies (dependency/retrieve-dependencies Mock 4)))))))

(deftest update-dependencies!-test
  (testing "we skip over values which aren't integers"
    (mt/with-model-cleanup [Dependency]
      (dependency/update-dependencies! Mock 2 {:test ["a" "b" "c"]})
      (is (= #{}
             (set (db/select Dependency, :model "Mock", :model_id 2))))))

  (testing "valid working dependencies list"
    (mt/with-model-cleanup [Dependency]
      (dependency/update-dependencies! Mock 7 {:test [1 2 3]})
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
        (dependency/update-dependencies! Mock 1 {:test [1 2]})
        (is (= #{{:model              "Mock"
                  :model_id           1
                  :dependent_on_model "test"
                  :dependent_on_id    1}
                 {:model              "Mock"
                  :model_id           1
                  :dependent_on_model "test"
                  :dependent_on_id    2}}
               (format-dependencies (db/select Dependency, :model "Mock", :model_id 1))))))))

(deftest identity-hash-test
  (testing "Dependency hashes are composed of the two model names and hashes of the target entities"
    (mt/with-temp* [Collection [coll   {:name "some collection" :location "/"}]
                    Database   [db     {:name "field-db" :engine :h2}]
                    Table      [table  {:schema "PUBLIC" :name "widget" :db_id (:id db)}]
                    Metric     [metric {:name "measured" :table_id (:id table)}]
                    Dependency [dep    {:model              "Collection"
                                        :model_id           (:id coll)
                                        :dependent_on_model "Metric"
                                        :dependent_on_id    (:id metric)
                                        :created_at         :%now}]]
      (is (= "cd893624"
             ; Note the extra vector here - dependencies have one complex hash extractor that returns a list of results.
             (serdes.hash/raw-hash [["Collection" (serdes.hash/identity-hash coll)
                                     "Metric"     (serdes.hash/identity-hash metric)]])
             (serdes.hash/identity-hash dep))))))
