(ns metabase-enterprise.representations.v0.database-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :details "{}"}]
      (let [edn (rep/export database)
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)
            rep (rep/normalize-representation rep)
            database (rep/persist! rep)
            database (t2/select-one :model/Database :id (:id database))
            edn (rep/export database)
            yaml (yaml/generate-string edn)
            rep2 (yaml/parse-string yaml)

            rep2 (rep/normalize-representation rep2)]
        (is (=? (dissoc rep :ref) rep2))))))
