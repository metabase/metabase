(ns metabase-enterprise.serialization.v2.seed-entity-ids-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.seed-entity-ids
    :as v2.seed-entity-ids]
   [metabase.models :refer [Collection]]
   [metabase.test :as mt]
   [toucan.db :as db]))

(deftest seed-entity-ids-test
  (testing "Sanity check: should succeed before we go around testing specific situations"
    (is (true? (v2.seed-entity-ids/seed-entity-ids! nil))))
  (testing "With a temp Collection with no entity ID"
    (mt/with-temp Collection [c {:name "No Entity ID Collection", :slug "no_entity_id_collection", :color "#FF0000"}]
      (db/update! Collection (:id c) :entity_id nil)
      (letfn [(entity-id []
                (some-> (db/select-one-field :entity_id Collection :id (:id c)) str/trim))]
        (is (= nil
               (entity-id)))
        (testing "Should return truthy on success"
          (is (= true
                 (v2.seed-entity-ids/seed-entity-ids! nil))))
        (is (= "c03d4632"
               (entity-id))))
      (testing "Error: duplicate entity IDs"
        (mt/with-temp Collection [c2 {:name "No Entity ID Collection", :slug "no_entity_id_collection", :color "#FF0000"}]
          (db/update! Collection (:id c2) :entity_id nil)
          (letfn [(entity-id []
                    (some-> (db/select-one-field :entity_id Collection :id (:id c2)) str/trim))]
            (is (= nil
                   (entity-id)))
            (testing "Should return falsey on error"
              (is (= false
                     (v2.seed-entity-ids/seed-entity-ids! nil))))
            (is (= nil
                   (entity-id)))))))))
