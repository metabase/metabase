(ns metabase.llm.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.llm.db :as llm.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest table-matches-over-partitions-test
  (let [schema (t2/select-one-fn :schema :model/Table :id (mt/id :venues))
        tables [{:table "venues"} {:table "venues", :schema schema} {:table "VENUES"} {:table "checkins"} {:table "users"}]
        read   (fn [] (frequencies (map :id (llm.db/active-tables-matching (mt/id) tables))))
        single (read)]
    (is (= 3 (count single)))
    (is (= #{1} (set (vals single))))
    (with-redefs [mdb.query/select-partition-size 2
                  mdb/select-partition-size       2]
      (is (= single (read))))))
