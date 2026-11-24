(ns metabase.eid-translation.requests-test
  (:require
   [clojure.test :refer :all]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.test :as mt]))

(deftest refs->ids-test
  (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
    (let [columns {:collection_id :model/Collection
                   :table_id      :model/Table
                   :field_id      :model/Field
                   :database_id   :model/Database
                   :creator_id    :model/User}]
      (testing "each ref of a column names its row by id: an entity id, a Table or Field ref, a Database name, an email"
        (is (= {:name          "x"
                :collection_id coll-id
                :table_id      (mt/id :venues)
                :field_id      (mt/id :venues :price)
                :database_id   (mt/id)
                :creator_id    (mt/user->id :crowberto)}
               (eid-translation/refs->ids {:name          "x"
                                           :collection_id coll-eid
                                           :table_id      [(:name (mt/db)) "PUBLIC" "VENUES"]
                                           :field_id      [(:name (mt/db)) "PUBLIC" "VENUES" "PRICE"]
                                           :database_id   (:name (mt/db))
                                           :creator_id    "crowberto@metabase.com"}
                                          columns))))
      (testing "numeric ids, nils and absent columns stay as they are"
        (is (= {:collection_id coll-id :table_id nil}
               (eid-translation/refs->ids {:collection_id coll-id :table_id nil} columns)))))))

(deftest refs->ids-missing-row-test
  (testing "a ref that names no row is a 404"
    (doseq [[column ref] {:collection_id "abcdefghijklmnopqrstu"
                          :table_id      ["no such db" "PUBLIC" "VENUES"]
                          :database_id   "no such db"
                          :creator_id    "nobody@metabase.com"}]
      (testing column
        (is (=? {:status-code 404}
                (try
                  (eid-translation/refs->ids {column ref} {:collection_id :model/Collection
                                                           :table_id      :model/Table
                                                           :database_id   :model/Database
                                                           :creator_id    :model/User})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))))))
