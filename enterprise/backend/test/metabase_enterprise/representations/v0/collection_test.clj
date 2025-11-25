(ns metabase-enterprise.representations.v0.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest validate-exported-collections-test
  (testing "Exported collections validate against schema"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"
                                                 :description "A test collection"}]
      (let [edn (export/export-entity collection)
            yaml-str (yaml/generate-string edn)
            rep (yaml/parse-string yaml-str)]
        (is (rep-read/parse rep))))))

(deftest export-collection-test
  (testing "Collection exports with correct structure"
    (mt/with-temp [:model/Collection collection {:name "Test Collection"
                                                 :description "A test collection"}]
      (let [exported (export/export-entity collection)]
        (is (= :collection (:type exported)))
        (is (= :v0 (:version exported)))
        (is (= "Test Collection" (:display_name exported)))
        (is (= "A test collection" (:description exported)))))))

(deftest import-collection-test
  (testing "Collection can be imported from representation"
    (let [rep {:type :collection
               :version :v0
               :name "test-collection"
               :display_name "Imported Collection"
               :description "A collection imported from YAML"}
          toucan-model (import/yaml->toucan rep nil)]
      (is (= "Imported Collection" (:name toucan-model)))
      (is (= "A collection imported from YAML" (:description toucan-model))))))

(deftest roundtrip-collection-test
  (testing "Collection export → import → export preserves data"
    (mt/with-temp [:model/Collection collection {:name "Roundtrip Test"
                                                 :description "Testing roundtrip"}]
      (let [export-1 (export/export-entity collection)
            yaml-str (yaml/generate-string export-1)
            rep (yaml/parse-string yaml-str)
            normalized (rep-read/parse rep)
              ;; Persist and reload
            persisted (mt/with-test-user :crowberto
                        (import/insert! normalized (v0-common/map-entity-index {})))
            export-2 (export/export-entity persisted)]
        (is (= (:display_name export-1) (:display_name export-2)))
        (is (= (:description export-1) (:description export-2)))
        (is (= (:type export-1) (:type export-2)))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Collection)]
    (is (= :collection (v0-common/representation-type entity)))))

(deftest export-nested-collection-test
  (testing "Nested collection exports with parent reference"
    (mt/with-temp [:model/Collection parent {:name "Parent Collection"}
                   :model/Collection child {:name "Child Collection"
                                            :location (format "/%d/" (:id parent))}]
      (mt/with-test-user :crowberto
        (let [exported (export/export-entire-collection (:id parent))
              ready (import/prepare-collection-tree-for-import exported)
              refs (import/insert-all! ready)]
          (is (= 2 (count ready)))
          (is refs)
          (let [[p c] (sort (keys refs))
                parent1 (get refs p)
                child1  (get refs c)]
            (is (= (str "/" (:id parent1) "/")
                   (:location child1)))
            (is (= (:name parent) (:name parent1)))
            (is (= (:name child)  (:name child1)))))))))
