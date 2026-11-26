(ns metabase.search.task.search-index-test
  (:require
   [clojure.test :refer :all]
   [honey.sql.helpers :as sql.helpers]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.core :as search]
   [metabase.search.task.search-index :as task]
   [metabase.search.test-util :as search.tu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
      (is (search/reindex! {:async? false}))
      (let [initial-size (index-size)
            table-name (search.index/active-table)]
        (is (pos? initial-size))
        (t2/delete! table-name :id (t2/select-one-pk table-name))
        (is (= (dec initial-size) (index-size)))
        (testing "It can cycle the index gracefully"
          (is (search/reindex! {:async? false}))
          (is (= initial-size (index-size))))))))

(deftest index-lock-survives-ddl-test
  (when (= :mysql (mdb/db-type))
    (search.tu/with-temp-index-table
      (let [table     (keyword (str "search_lock_probe_" (random-uuid)))
            holding   (promise)
            release   (promise)
            attempted (promise)
            entered   (promise)
            holder    (future
                        (#'task/do-with-index-lock
                         (fn []
                           (t2/query {:create-table [table], :with-columns [[:id :integer]]})
                           (deliver holding true)
                           (deref release 10000 :timeout))))]
        (try
          (is (true? (deref holding 10000 :timeout)))
          (let [contender (future
                            (deliver attempted true)
                            (#'task/do-with-index-lock #(deliver entered true)))]
            (try
              (is (true? (deref attempted 5000 :timeout)))
              (is (= :blocked (deref entered 500 :blocked)))
              (deliver release true)
              (is (true? (deref entered 5000 :timeout)))
              (is (not= :timeout (deref contender 5000 :timeout)))
              (finally
                (future-cancel contender))))
          (finally
            (deliver release true)
            (deref holder 5000 :timeout)
            (future-cancel holder)
            (t2/query {:drop-table [:if-exists table]})))))))
