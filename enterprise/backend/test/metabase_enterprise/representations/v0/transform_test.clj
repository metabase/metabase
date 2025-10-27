(ns metabase-enterprise.representations.v0.transform-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.import :as import]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def good-yamls ["test_resources/representations/v0/orders-count.transform.yml"
                 "test_resources/representations/v0/orders-count-existing.transform.yml"])

(deftest type->model-test
  (testing "type->model returns correct model for :transform"
    (is (= :model/Transform (v0-common/type->model :transform)))))

(deftest validate-example-yamls
  (testing "Testing valid examples"
    (doseq [filename good-yamls]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (rep/normalize-representation rep))))))
  (testing "Testing invalid examples"
    (doseq [filename
            []]
      (testing (str "Validating: " filename)
        (let [rep (yaml/from-file filename)]
          (is (thrown? clojure.lang.ExceptionInfo (rep/normalize-representation rep))))))))

;; TODO: test passes but I suspect this is also incorrectly using model/Transform:
(deftest validate-exported-transforms
  (doseq [query [(mt/native-query {:query "select 1"})
                 (mt/mbql-query users)]]
    (mt/with-temp [:model/Transform transform {:name "TEST"
                                               :source {:type :query
                                                        :query query}
                                               :target {:type "table"
                                                        :name "output_table"
                                                        :schema "output_schema"}}]
      (let [edn (rep/export transform)
            ;; convert to yaml and read back in to convert keywords to strings, etc
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)]
        (is (rep/normalize-representation rep))))))

(deftest can-import
  (doseq [filename good-yamls]
    (let [rep (yaml/from-file filename)
          ref-index {(v0-common/unref (:database rep))
                     (t2/select-one :model/Database (mt/id))}]
      (is (rep/persist! rep ref-index)))))

;; TODO: fix ID usage here, db lookup fails
#_(deftest import-export
    (testing "Testing import then export roundtrip"
      (doseq [filename good-yamls]
        (testing (str "Importing-Exporting: " filename)
          (let [rep (import/import-yaml filename)
                rep (walk/postwalk-replace {(:database rep)
                                            (v0-common/->ref 1 :database)}
                                           rep)
                ref-index (v0-common/map-entity-index
                           {(v0-common/unref (v0-common/->ref 1 :database))
                            (t2/select-one :model/Database :id 1)})
                persisted (rep/persist! rep ref-index)]
            (is persisted)
            (let [edn (rep/export persisted)
                  yaml (yaml/generate-string edn)
                  rep2 (yaml/parse-string yaml)]
              (is (=? (dissoc rep :ref :database) rep2))))))))

;; TODO: update with latest transform schema in db
#_(deftest export-import
    (testing "Testing export then import roundtrip"
      (doseq [query [(mt/native-query {:query "select 1"})
                     (mt/mbql-query users)]]
        (mt/with-temp [:model/Transform transform {:name "TRANSFORM"
                                                   :source {:type "query"
                                                            :database (mt/id)
                                                            :query query}
                                                   :target {:type "table"
                                                            :schema "PUBLIC"
                                                            :name "SOME_TABLE"}}]
          (let [edn (rep/export transform)
                yaml (yaml/generate-string edn)
                rep (yaml/parse-string yaml)
                rep (rep/normalize-representation rep)
                ref-index (v0-common/map-entity-index
                           {(v0-common/unref (:database edn)) (t2/select-one :model/Database (mt/id))})
                transform (rep/persist! rep ref-index)
                transform (t2/select-one :model/Transform :id (:id transform))
                edn (rep/export transform)
                yaml (yaml/generate-string edn)
                rep2 (yaml/parse-string yaml)
                rep2 (rep/normalize-representation rep2)]
            (is (=? (dissoc rep :ref) rep2)))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Transform)]
    (is (= :transform (v0-common/representation-type entity)))))
