(ns metabase.task.search-index-test
  (:require
   [clojure.test :refer :all]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.test-util :as search.tu]
   [metabase.task.search-index :as task]
   [toucan2.core :as t2]))

;; TODO this is coupled to appdb engines at the moment
(defn- index-size []
  (t2/count (search.index/active-table)))

(deftest index!-test
  (search.tu/with-temp-index-table
   ;; TODO this is coupled to appdb engines at the moment
    (t2/query (sql.helpers/drop-table (search.index/active-table)))
    (testing "It can recreate the index from scratch"
     ;; May return falsey if there is nothing to index.
      (is (task/init!))
      (is (pos? (index-size))))
    (testing "It will reuse an existing index"
      (is (not (task/init!))))))

(deftest reindex!-test
  (search.tu/with-temp-index-table
   ;; TODO this is coupled to appdb engines at the moment
    (t2/query (sql.helpers/drop-table (search.index/active-table)))
    (testing "It can recreate the index from scratch"
      (is (task/reindex!))
      (let [initial-size (index-size)
            table-name (search.index/active-table)]
        (is (pos? initial-size))
        (t2/delete! table-name (t2/select-one-pk table-name))
        (is (= (dec initial-size) (index-size)))
        (testing "It can cycle the index gracefully"
          (is (task/reindex!))
          (is (= initial-size (index-size))))))))
