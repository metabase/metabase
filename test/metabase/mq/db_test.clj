(ns metabase.mq.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.query :as mdb.query]
   [metabase.mq.db :as mq.db]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest outbox-rows-delete-over-partitions-test
  (t2/with-transaction [_conn nil {:rollback-only true}]
    (let [ids (vec (for [i (range 5)] (mq.db/insert-outbox-row! "partition-test-queue" (str i))))]
      (with-redefs [mdb/delete-partition-size 2
                    mdb.query/delete-partition-size 2]
        (is (= 5 (mq.db/delete-outbox-rows! ids))))
      (is (zero? (t2/count :queue_message_outbox :id [:in ids]))))))
