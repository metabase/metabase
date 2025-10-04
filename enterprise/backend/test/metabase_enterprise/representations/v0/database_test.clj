(ns metabase-enterprise.representations.v0.database-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-import
  (testing "Testing export then import roundtrip"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :details "{}"}]
      (let [edn (rep/export-with-refs database)
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)
            rep (rep/normalize-representation rep)
            database (rep/persist! rep)
            database (t2/select-one :model/Database :id (:id database))
            edn (rep/export-with-refs database)
            yaml (yaml/generate-string edn)
            rep2 (yaml/parse-string yaml)

            rep2 (rep/normalize-representation rep2)]
        (is (=? (dissoc rep :ref) rep2)))))

  (testing "Testing export then import roundtrip, import doesn't change details"
    (mt/with-temp [:model/Database database {:engine :postgres
                                             :name "abc"
                                             :description "MY DB"
                                             :details "{}"}]
      (let [edn (rep/export-with-refs database)
            edn (assoc edn
                       :description "CHANGE"
                       :details {:url "hello"})
            yaml (yaml/generate-string edn)
            rep (yaml/parse-string yaml)
            rep (rep/normalize-representation rep)
            database2 (rep/persist! rep)
            database2 (t2/select-one :model/Database :id (:id database2))]
        (is (=? database database2))))))
