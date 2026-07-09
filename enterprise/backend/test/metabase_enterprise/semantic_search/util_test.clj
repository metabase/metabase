(ns metabase-enterprise.semantic-search.util-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase-enterprise.semantic-search.util :as semantic.util]
   [metabase.test :as mt]
   [next.jdbc :as jdbc]))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest catalog-lookups-schema-scoping-test
  (testing "qualified names scope table/index existence checks to their schema; a same-named object in
            another schema (e.g. the app db's public) must not satisfy them"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db-defaults!
        (let [pgvector (semantic.env/get-pgvector-datasource!)]
          (jdbc/execute! pgvector ["CREATE TABLE decoy (id int)"])
          (jdbc/execute! pgvector ["CREATE INDEX decoy_idx ON decoy (id)"])
          (jdbc/execute! pgvector ["CREATE SCHEMA s2"])
          (testing "unqualified names keep the historical any-schema behavior"
            (is (true? (semantic.util/table-exists? pgvector "decoy")))
            (is (true? (semantic.util/index-exists? pgvector "decoy_idx"))))
          (testing "qualified names are not fooled by the public decoys"
            (is (true?  (semantic.util/table-exists? pgvector "public.decoy")))
            (is (true?  (semantic.util/index-exists? pgvector "public.decoy_idx")))
            (is (false? (semantic.util/table-exists? pgvector "s2.decoy")))
            (is (false? (semantic.util/index-exists? pgvector "s2.decoy_idx"))))
          (testing "qualified names find the objects in their own schema"
            (jdbc/execute! pgvector ["CREATE TABLE s2.decoy (id int)"])
            (jdbc/execute! pgvector ["CREATE INDEX decoy_idx ON s2.decoy (id)"])
            (is (true? (semantic.util/table-exists? pgvector "s2.decoy")))
            (is (true? (semantic.util/index-exists? pgvector "s2.decoy_idx")))))))))
