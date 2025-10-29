(ns metabase-enterprise.representations.v0.database-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [representations.read :as rep-read]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest type->model-test
  (testing "type->model returns correct model for :database"
    (is (= :model/Database (v0-common/type->model :database)))))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :details "{}"}]
      (let [edn (rep/export database)
            yaml (rep-yaml/generate-string edn)
            rep (rep-yaml/parse-string yaml)
            rep (rep-read/parse rep)
            database (rep/persist! rep)
            database (t2/select-one :model/Database :id (:id database))
            edn (rep/export database)
            yaml (rep-yaml/generate-string edn)
            rep2 (rep-yaml/parse-string yaml)

            rep2 (rep-read/parse rep2)]
        (is (=? (dissoc rep :name) rep2)))))

  (testing "Testing export then import roundtrip, import doesn't change details"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :description "MY DB"}]
      (let [edn (rep/export database)
            edn (assoc edn :description "CHANGE")
            yaml (rep-yaml/generate-string edn)
            rep (rep-yaml/parse-string yaml)
            rep (rep-read/parse rep)
            database2 (rep/persist! rep)
            database2 (t2/select-one :model/Database :id (:id database2))]
        (is (=? database database2))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Database)]
    (is (= :database (v0-common/representation-type entity)))))
