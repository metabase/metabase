(ns metabase.model-persistence.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.model-persistence.db :as model-persistence.db]
   [metabase.test :as mt]))

(defn- in-small-partitions!
  "What `f` returns when reads take at most two ids per statement."
  [f]
  (with-redefs [mdb.query/select-partition-size 2]
    (f)))

(deftest ^:synchronized reads-over-partitions-test
  (mt/with-temp [:model/Database      {db-1 :id}   {}
                 :model/Database      {db-2 :id}   {}
                 :model/Database      {db-3 :id}   {}
                 :model/Card          {card-1 :id} {:database_id db-1, :type :model}
                 :model/Card          {card-2 :id} {:database_id db-2, :type :model}
                 :model/Card          {card-3 :id} {:database_id db-3, :type :model}
                 :model/PersistedInfo _            {:database_id db-1, :card_id card-1}
                 :model/PersistedInfo _            {:database_id db-2, :card_id card-2}
                 :model/PersistedInfo _            {:database_id db-3, :card_id card-3}]
    (testing "counts add up over partitions"
      (let [f #(model-persistence.db/persisted-model-count-for-databases [db-1 db-2 db-3])]
        (is (= 3 (f) (in-small-partitions! f)))))
    (testing "sets hold every row"
      (let [f #(model-persistence.db/card-ids-with-persisted-info [card-1 card-2 card-3])]
        (is (= #{card-1 card-2 card-3} (f) (in-small-partitions! f)))))))
