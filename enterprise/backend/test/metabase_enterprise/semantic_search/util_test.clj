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

(deftest ^:parallel quote-ident-test
  (testing "wraps in double quotes and doubles any embedded double quote (the next.jdbc.quoted/postgres contract)"
    (is (= "\"semantic_search\"" (semantic.util/quote-ident "semantic_search")))
    (is (= "\"weird\"\"name\"" (semantic.util/quote-ident "weird\"name")))))

(deftest ^:parallel column-keyword-test
  (testing "a dotted-name keyword (renders as separate identifiers), never a namespaced one"
    (is (= :index_table_1.model (semantic.util/column-keyword "index_table_1" "model")))
    (is (= :semantic_search.index_table_1.model
           (semantic.util/column-keyword "semantic_search.index_table_1" "model")))
    (is (nil? (namespace (semantic.util/column-keyword "semantic_search.t" "c")))))
  (testing "conflict-target-column drops the schema — ON CONFLICT names the target by its bare relation"
    (is (= :index_table_1.model
           (semantic.util/conflict-target-column "semantic_search.index_table_1" "model")))))

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
