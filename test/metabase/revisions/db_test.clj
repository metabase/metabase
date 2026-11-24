(ns metabase.revisions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.query :as mdb.query]
   [metabase.revisions.db :as revisions.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest partitioned-reads-match-whole-reads-test
  (mt/with-temp [:model/Card      {c1 :id} {}
                 :model/Card      {c2 :id} {}
                 :model/Card      {c3 :id} {}
                 :model/Dashboard {d1 :id} {}
                 :model/Dashboard {d2 :id} {}]
    (doseq [[model-name model-id] [["Card" c1] ["Card" c2] ["Card" c3] ["Dashboard" d1] ["Dashboard" d2]]]
      (t2/insert! :model/Revision {:model       model-name
                                   :model_id    model-id
                                   :user_id     (mt/user->id :crowberto)
                                   :object      {}
                                   :is_creation false}))
    (let [reads {:latest-changes #(set (map (juxt :model :model_id) (revisions.db/latest-changes [c1 c2 c3] [d1 d2])))}]
      (doseq [[read-name read-fn] reads]
        (testing read-name
          (let [whole (read-fn)]
            (is (seq whole))
            (is (= whole (with-redefs [mdb.query/select-partition-size 2]
                           (read-fn))))))))))
