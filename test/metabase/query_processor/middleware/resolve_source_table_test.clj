(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor.middleware.resolve-source-table :as resolve-source-table]
            [metabase.query-processor.store :as qp.store]
            [metabase.test :as mt]))

(defn- resolve-source-tables [query]
  (:pre (mt/test-qp-middleware resolve-source-table/resolve-source-tables query)))

(defn- do-with-store-contents [f]
  ;; force creation of test data DB so things don't get left in the cache before running tests below
  (mt/id)
  (qp.store/with-store
    (qp.store/fetch-and-store-database! (mt/id))
    (f)
    (mt/store-contents)))

(defmacro ^:private with-store-contents {:style/indent 0} [& body]
  `(do-with-store-contents (fn [] ~@body)))

(defn- resolve-and-return-store-contents [query]
  (with-store-contents
    (resolve-source-tables query)))

(deftest basic-test
  (testing "does `resolve-source-tables` resolve source tables?"
    (is (= {:database "test-data", :tables #{"VENUES"}, :fields #{}}
           (resolve-and-return-store-contents (mt/mbql-query venues))))))

(deftest validate-database-test
  (testing "If the Table does not belong to the current Database, does it throw an Exception?"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Table does not exist, or belongs to a different Database"
           (resolve-and-return-store-contents
            {:database (mt/id)
             :type     :query
             :query    {:source-table table-id}}))))))

(deftest validate-source-table-test
  (testing "Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid :source-table 'ABC': should be resolved to a Table ID by now"
         (resolve-and-return-store-contents

          {:database (mt/id)
           :type     :query
           :query    {:source-table "ABC"}})))

    ;; TODO -- a little weird that this triggers a schema validation error while the string Table ID gets a more
    ;; useful error message
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Output of query->source-table-ids does not match schema"
         (resolve-and-return-store-contents

          {:database (mt/id)
           :type     :query
           :query    {:source-table 0}})))))

(deftest nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in nested source queries?"
    (is (= {:database "test-data", :tables #{"VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query nil
              {:source-query {:source-table $$venues}}))))

    (is (= {:database "test-data", :tables #{"VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query nil
              {:source-query {:source-query {:source-table $$venues}}}))))))

(deftest joins-test
  (testing "Does `resolve-source-tables` resolve source tables in joins?"
    (is (= {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:joins [{:source-table $$categories
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest joins-in-nested-queries-test
  (testing "Does `resolve-source-tables` resolve source tables in joins inside nested source queries?"
    (is (= {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-table $$categories
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))

(deftest nested-queries-in-joins-test
  (testing "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins?"
    (is (= {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:joins [{:source-query {:source-table $$categories}
                        :alias        "c"
                        :condition    [:= $category_id &c.categories.id]}]}))))))

(deftest nested-queries-in-joins-in-nested-queries-test
  (testing (str "Does `resolve-source-tables` resolve source tables inside nested source queries inside joins inside "
                "nested source queries?")
    (is (= {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
           (resolve-and-return-store-contents
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :joins        [{:source-query {:source-table $$categories}
                                              :alias        "c"
                                              :condition    [:= $category_id &c.categories.id]}]}}))))))
