(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.database :refer [Database]]
   [metabase.models.table :refer [Table]]
   [metabase.query-processor.middleware.resolve-source-table
    :as qp.resolve-source-table]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- store-contents
  "Fetch the names of all the objects currently in the QP Store."
  []
  (let [provider (qp.store/metadata-provider)
        tables   [:venues :categories :users :checkins]]
    {:tables (into #{}
                   (keep (fn [table]
                           (:name (lib.metadata.protocols/cached-metadata provider :metadata/table (mt/id table)))))
                   tables)}))

(defn- resolve-source-tables [query]
  (qp.resolve-source-table/resolve-source-tables query))

(defn- do-with-store-contents [thunk]
  (qp.store/with-metadata-provider (mt/id)
    (thunk)
    (store-contents)))

(defmacro ^:private with-store-contents {:style/indent 0} [& body]
  `(do-with-store-contents (fn [] ~@body)))

(defn- resolve-and-return-store-contents [query]
  (with-store-contents
    (resolve-source-tables query)))

(deftest ^:parallel basic-test
  (testing "does `resolve-source-tables` resolve source tables?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-store-contents (mt/mbql-query venues))))))

(deftest ^:parallel validate-database-test
  (testing "If the Table does not belong to the current Database, does it throw an Exception?"
    (t2.with-temp/with-temp [Database {database-id :id} {}
                             Table    {table-id :id}    {:db_id database-id}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"\QFailed to fetch :metadata/table\E"
           (resolve-and-return-store-contents
            {:database (mt/id)
             :type     :query
             :query    {:source-table table-id}}))))))

(deftest ^:parallel validate-source-table-test
  (testing "Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"\QInvalid :source-table 'ABC': should be resolved to a Table ID by now\E"
         (resolve-and-return-store-contents
          {:database (mt/id)
           :type     :query
           :query    {:source-table "ABC"}})))))

(deftest ^:parallel validate-source-table-test-2
  (testing "Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int"
    ;; TODO -- a little weird that this triggers a schema validation error while the string Table ID gets a more
    ;; useful error message
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid output:.*should be a positive int, got: 0"
         (resolve-and-return-store-contents
          {:database (mt/id)
           :type     :query
           :query    {:source-table 0}})))))

(deftest ^:parallel nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in nested source queries?"
    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query nil
              {:source-query {:source-table $$venues}}))))

    (is (= {:tables #{"VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query nil
              {:source-query {:source-query {:source-table $$venues}}}))))))

(deftest ^:parallel joins-test
  (testing "Does `resolve-source-tables` resolve source tables in joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest ^:parallel joins-in-nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in joins inside nested source queries?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-table $$categories
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))

(deftest ^:parallel nested-queries-in-joins-test
  (testing "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins?"
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:joins [{:source-query {:source-table $$categories}
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest ^:parallel nested-queries-in-joins-in-nested-queries-test
  (testing (str "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins inside "
                "nested source queries?")
    (is (= {:tables #{"CATEGORIES" "VENUES"}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-query {:source-table $$categories}
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))
