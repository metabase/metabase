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

(deftest ^:parallel quote-table-test
  (testing "a schema-qualified name quotes each part separately, not the whole thing as one identifier"
    (is (= "\"semantic_search\".\"index_table_1\""
           (semantic.util/quote-table "semantic_search.index_table_1"))))
  (testing "an unqualified name is a single quoted identifier"
    (is (= "\"index_table_1\"" (semantic.util/quote-table "index_table_1")))))

(deftest ^:parallel column-keyword-test
  (testing "a dotted-name keyword (renders as separate identifiers), never a namespaced one"
    (is (= :index_table_1.model (semantic.util/column-keyword "index_table_1" "model")))
    (is (= :semantic_search.index_table_1.model
           (semantic.util/column-keyword "semantic_search.index_table_1" "model")))
    (is (nil? (namespace (semantic.util/column-keyword "semantic_search.t" "c")))))
  (testing "conflict-target-column drops the schema — ON CONFLICT names the target by its bare relation"
    (is (= :index_table_1.model
           (semantic.util/conflict-target-column "semantic_search.index_table_1" "model")))))

(deftest index-state-test
  (testing "classifies catalog and concurrent-build state"
    (doseq [[row expected] [[nil nil]
                            [{:is_ready true, :is_valid true, :is_building false} :ready]
                            [{:is_ready false, :is_valid false, :is_building true} :building]
                            [{:is_ready true, :is_valid false, :is_building false} :invalid]]]
      (mt/with-dynamic-fn-redefs [jdbc/execute-one! (constantly row)]
        (is (= expected (semantic.util/index-state ::pgvector "index_1"))))))
  (testing "only ready indexes exist; absent and abandoned invalid indexes need a build"
    (doseq [[state exists? needs-build?] [[nil false true]
                                          [:ready true false]
                                          [:building false false]
                                          [:invalid false true]]]
      (mt/with-dynamic-fn-redefs [semantic.util/index-state (constantly state)]
        (is (= exists? (semantic.util/index-exists? ::pgvector "index_1")))
        (is (= needs-build? (semantic.util/index-needs-build? ::pgvector "index_1")))))))

(deftest index-state-catalog-query-test
  (let [queries (atom [])]
    (mt/with-dynamic-fn-redefs
      [jdbc/execute-one! (fn [_ query _]
                           (swap! queries conj query)
                           {:is_ready true, :is_valid true, :is_building false})]
      (is (= :ready (semantic.util/index-state ::pgvector "semantic_search.index_1")))
      (is (= :ready (semantic.util/index-state ::pgvector "index_2"))))
    (testing "both catalog queries distinguish active builds from abandoned invalid indexes"
      (doseq [[statement] @queries]
        (is (re-find #"x\.indisready" statement))
        (is (re-find #"x\.indisvalid" statement))
        (is (re-find #"pg_stat_progress_create_index" statement))))
    (testing "qualified names retain their schema constraint"
      (is (= ["semantic_search" "index_1"] (rest (first @queries))))
      (is (= ["index_2"] (rest (second @queries)))))))

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
