(ns metabase.query-processor.middleware.resolve-source-table-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.resolve-source-table :as resolve-source-table]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

(defn- resolve-source-tables [query]
  (:pre (mt/test-qp-middleware resolve-source-table/resolve-source-tables query)))

(defn- do-with-store-contents [f]
  ;; force creation of test data DB so things don't get left in the cache before running tests below
  (data/id)
  (qp.store/with-store
    (qp.store/fetch-and-store-database! (data/id))
    (f)
    (qp.test-util/store-contents)))

(defmacro ^:private with-store-contents {:style/indent 0} [& body]
  `(do-with-store-contents (fn [] ~@body)))

;; does `resolve-source-tables` resolve source tables?
(expect
  {:database "test-data", :tables #{"VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables (data/mbql-query venues))))

;; If the Table does not belong to the current Database, does it throw an Exception?
(expect
  Exception
  (with-store-contents
    (tt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id}    {:db_id database-id}]]
      (resolve-source-tables {:database (data/id)
                              :type     :query
                              :query     {:source-table table-id}}))))

;; Should throw an Exception if there's a `:source-table` in the query that IS NOT a positive int
(expect
  Exception
  (resolve-source-tables
   {:database (data/id)
    :type     :query
    :query    {:source-table "ABC"}}))

(expect
  Exception
  (resolve-source-tables
   {:database (data/id)
    :type     :query
    :query    {:source-table 0}}))

;; Does `resolve-source-tables` resolve source tables in nested source queries?
(expect
  {:database "test-data", :tables #{"VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query nil
       {:source-query {:source-table $$venues}}))))

(expect
  {:database "test-data", :tables #{"VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query nil
       {:source-query {:source-query {:source-table $$venues}}}))))

;; Does `resolve-source-tables` resolve source tables in joins?
(expect
  {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query venues
       {:joins [{:source-table $$categories
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; Does `resolve-source-tables` resolve source tables in joins inside nested source queries?
(expect
  {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query venues
       {:source-query {:source-table $$venues
                       :joins        [{:source-table $$categories
                                       :alias        "c"
                                       :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}}))))

;; Does `resolve-source-tables` resolve source tables inside nested source queries inside joins?
(expect
  {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query venues
       {:joins [{:source-query {:source-table $$categories}
                 :alias        "c"
                 :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}))))

;; Does `resolve-source-tables` resolve source tables inside nested source queries inside joins inside nested source
;; queries?
(expect
  {:database "test-data", :tables #{"CATEGORIES" "VENUES"}, :fields #{}}
  (with-store-contents
    (resolve-source-tables
     (data/mbql-query venues
       {:source-table $$venues
        :source-query {:joins [{:source-query {:source-table $$categories}
                                :alias        "c"
                                :condition    [:= $category_id [:joined-field "c" $categories.id]]}]}}))))
