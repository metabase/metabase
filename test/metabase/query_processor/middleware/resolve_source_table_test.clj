(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.query-processor.middleware.resolve-source-table :as qp.resolve-source-table]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- cached-metadata
  "Fetch the names of all the objects currently in the QP Store."
  [metadata-provider]
  (let [tables [:venues :categories :users :checkins]]
    {:tables (into #{}
                   (keep (fn [table]
                           (:name (lib.metadata.protocols/cached-metadata metadata-provider :metadata/table (mt/id table)))))
                   tables)}))

(defn- resolve-and-return-cached-metadata [query]
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        query             (lib/query metadata-provider query)]
    (qp.resolve-source-table/resolve-source-tables query)
    (cached-metadata metadata-provider)))

(deftest ^:parallel basic-test
  (testing "does `resolve-source-tables` resolve source tables?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata (mt/mbql-query venues))))))

(deftest ^:parallel validate-database-test
  (testing "If the Table does not belong to the current Database, does it throw an Exception?"
    (t2.with-temp/with-temp [:model/Database {database-id :id} {}
                             :model/Table    {table-id :id}    {:db_id database-id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Failed to fetch :metadata/table \d+: either it does not exist, or it belongs to a different Database"
           (resolve-and-return-cached-metadata
            {:database (mt/id)
             :type     :query
             :query    {:source-table table-id}}))))))

(deftest ^:parallel validate-source-table-test
  (testing "Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be a positive int, got: 0"
         (resolve-and-return-cached-metadata
          {:database (mt/id)
           :type     :query
           :query    {:source-table 0}})))))

(deftest ^:parallel nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in nested source queries?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query nil
              {:source-query {:source-table $$venues}}))))

    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query nil
              {:source-query {:source-query {:source-table $$venues}}}))))))

(deftest ^:parallel joins-test
  (testing "Does `resolve-source-tables` resolve source tables in joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest ^:parallel joins-in-nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in joins inside nested source queries?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-table $$categories
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))

(deftest ^:parallel nested-queries-in-joins-test
  (testing "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query venues
              {:joins [{:source-query {:source-table $$categories}
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest ^:parallel nested-queries-in-joins-in-nested-queries-test
  (testing (str "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins inside "
                "nested source queries?")
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-cached-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-query {:source-table $$categories}
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))
