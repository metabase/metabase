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

(deftest export-import
  (testing "Testing export"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :details "{}"}]
      (let [edn (rep/export database)
            yaml (rep-yaml/generate-string edn)
            rep (rep-yaml/parse-string yaml)
            rep (rep-read/parse rep)]
        (is (=? {:name (str "database-" (:id database)),
                 :type :database,
                 :version :v0,
                 :engine "postgres",
                 :display_name "abc",
                 :connection_details {},
                 :schemas []}
                rep))))))

(deftest representation-type-test
  (doseq [entity (t2/select :model/Database)]
    (is (= :database (v0-common/representation-type entity)))))
