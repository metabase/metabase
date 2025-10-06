(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.cached-provider :as lib.metadata.cached-provider]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.resolve-source-table :as qp.resolve-source-table]))

(defn- cached-metadata
  "Fetch the names of all the objects currently in the QP Store."
  [metadata-provider]
  (let [tables [:venues :categories :users :checkins]]
    {:tables (into #{}
                   (keep (fn [table]
                           (:name (lib.metadata.protocols/cached-metadata metadata-provider :metadata/table (meta/id table)))))
                   tables)}))

(defn- resolve-and-return-cached-metadata
  ([query]
   (resolve-and-return-cached-metadata (lib.metadata.cached-provider/cached-metadata-provider meta/metadata-provider) query))

  ([metadata-provider query]
   (let [query (lib/query metadata-provider query)]
     (qp.resolve-source-table/resolve-source-tables query)
     (cached-metadata metadata-provider))))

(deftest ^:parallel basic-test
  (testing "does `resolve-source-tables` resolve source tables?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata (lib.tu.macros/mbql-query venues))))))

(deftest ^:parallel validate-database-test
  (testing "If the Table does not belong to the current Database, does it throw an Exception?"
    (let [mp (lib.metadata.cached-provider/cached-metadata-provider
              (lib.tu/mock-metadata-provider
               {:database (merge meta/database
                                 {:id 1})
                :tables   [(merge (meta/table-metadata :venues)
                                  {:id    1
                                   :db-id 1})]}))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Failed to fetch :metadata/table \d+: either it does not exist, or it belongs to a different Database"
           (resolve-and-return-cached-metadata
            mp
            {:database (meta/id)
             :type     :query
             :query    {:source-table 2}}))))))

(deftest ^:parallel validate-source-table-test
  (testing "Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be a positive int, got: 0"
         (resolve-and-return-cached-metadata
          {:database (meta/id)
           :type     :query
           :query    {:source-table 0}})))))

(deftest ^:parallel nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in nested source queries?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query nil
              {:source-query {:source-table $$venues}}))))

    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query nil
              {:source-query {:source-query {:source-table $$venues}}}))))))

(deftest ^:parallel joins-test
  (testing "Does `resolve-source-tables` resolve source tables in joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category-id &c.categories.id]}]}))))))

(deftest ^:parallel joins-in-nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in joins inside nested source queries?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-table $$categories
                                              :alias        "c"
                                              :condition    [:= $category-id &c.categories.id]}]}}))))))

(deftest ^:parallel nested-queries-in-joins-test
  (testing "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query venues
              {:joins [{:source-query {:source-table $$categories}
                        :alias        "c"
                        :condition    [:= $category-id &c.categories.id]}]}))))))

(deftest ^:parallel nested-queries-in-joins-in-nested-queries-test
  (testing (str "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins inside "
                "nested source queries?")
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (lib.tu.macros/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-query {:source-table $$categories}
                                              :alias        "c"
                                              :condition    [:= $category-id &c.categories.id]}]}}))))))

(deftest ^:parallel disallow-joins-against-table-on-different-db-test
  (testing "Test that joining against a table in a different DB throws an Exception"
    (let [mp (lib.tu/mock-metadata-provider
              {:database meta/database
               :tables   [(meta/table-metadata :venues)]})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\QFailed to fetch :metadata/table\E"
           (qp.resolve-source-table/resolve-source-tables
            (lib/query
             mp
             (lib.tu.macros/mbql-query venues
               {:joins [{:source-table (meta/id :categories)
                         :alias        "t"
                         :condition    [:= $category-id 1]}]}))))))))
