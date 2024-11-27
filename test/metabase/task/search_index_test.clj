(ns metabase.task.search-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.test-util :as search.tu]
   [metabase.task.search-index :as task]
   [toucan2.core :as t2]))

(defn- index-size []
  (t2/count search.index/*active-table*))

;; TODO this is coupled to appdb engines at the moment
(deftest reindex!-test
  (search.tu/with-temp-index-table
    (is (zero? (t2/count search.index/*active-table*)))
    (testing "It can recreate the index from scratch"
      (task/reindex! true)
      (let [initial-size (index-size)]
        (is (pos? initial-size))
        (t2/delete! search.index/*active-table* (t2/select-one-pk search.index/*active-table*))
        (is (= (dec initial-size) (index-size)))
        (testing "It can cycle the index gracefully"
          (task/reindex! false)
          (is (= initial-size (index-size))))))))
