(ns metabase.serialization.storage-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]))

(deftest storage-path-test
  (testing "a card is stored under its collection's path, and a field under its table's directory"
    (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {:name "Outer"}
                   :model/Card       card                              {:collection_id coll-id :name "My Card"}]
      (let [[exported] (into [] (serialization/export :model/Card [card]))]
        (is (=? [{:label "collections"} {:label "main"} {:label "Outer" :key coll-eid} {:label "My Card"}]
                (first (serialization/batch-storage-paths [exported]))))))
    (is (= [{:label "databases"} {:label "db" :key "db"} {:label "tables"} {:label "t" :key "t"}
            {:label "fields"} {:label "f" :key "f"}]
           (first (serialization/storage-paths :model/Field [{:serdes/meta [{:model "Field"}] :table_id ["db" nil "t"] :name "f"}] nil))))))
