(ns metabase-enterprise.representations.lookup-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [toucan2.core :as t2]))

(deftest lookup-by-id-test
  (doseq [model [:model/Card
                 :model/Database
                 :model/Transform
                 :model/Collection
                 :model/NativeQuerySnippet]
          entity (t2/select model)]
    (let [id (:id entity)
          rep-type (v0-common/representation-type entity)]
      (is (= id (:id (lookup/lookup-by-id rep-type id)))))))

(deftest lookup-by-id-string-test
  (testing "lookup-by-id handles string id gracefully (returns nil)"
    (doseq [model [:model/Card
                   :model/Database
                   :model/Transform
                   :model/Collection
                   :model/NativeQuerySnippet]
            entity (t2/select model)]
      (let [id (str (:id entity))
            rep-type (v0-common/representation-type entity)]
        (is (nil? (lookup/lookup-by-id rep-type id)))))))

(deftest lookup-by-entity-id-test
  (doseq [model [:model/Card
                 :model/Transform
                 :model/Collection
                 :model/NativeQuerySnippet
                 ;; Databases do not have entity ids
                 ]
          entity (t2/select model)]
    (let [entity-id (:entity_id entity)
          rep-type (v0-common/representation-type entity)]
      (is (= (:id entity) (:id (lookup/lookup-by-entity-id rep-type entity-id)))))))

(deftest lookup-by-entity-id-long-test
  (testing "lookup-by-entity-id handles long entity-id gracefully (returns nil)"
    (doseq [model [:model/Card
                   :model/Transform
                   :model/Collection
                   :model/NativeQuerySnippet]
            entity (t2/select model)]
      (let [entity-id (rand-int 1000)
            rep-type (v0-common/representation-type entity)]
        (is (nil? (lookup/lookup-by-entity-id rep-type entity-id)))))))

(deftest lookup-by-name-test
  (doseq [model [:model/Card
                 :model/Transform
                 :model/Collection
                 :model/NativeQuerySnippet
                 :model/Database]]
    (let [entities (t2/select model)]
      (doseq [[name group] (group-by :name entities)]
        (if (= 1 (count group))
          (let [entity (first group)
                rep-type (v0-common/representation-type entity)]
            (is (= (:id entity) (:id (lookup/lookup-by-name rep-type name)))))
          (let [entity (first group)
                rep-type (v0-common/representation-type entity)]
            (is (thrown? clojure.lang.ExceptionInfo
                         (lookup/lookup-by-name rep-type name)))))))))

(deftest lookup-by-name-non-string-test
  (testing "lookup-by-name handles non-string name gracefully (returns nil)"
    (doseq [model [:model/Card
                   :model/Transform
                   :model/Collection
                   :model/NativeQuerySnippet
                   :model/Database]
            entity (t2/select model)]
      (let [name-as-keyword (keyword (:name entity))
            rep-type (v0-common/representation-type entity)]
        (is (nil? (lookup/lookup-by-name rep-type name-as-keyword)))))))
