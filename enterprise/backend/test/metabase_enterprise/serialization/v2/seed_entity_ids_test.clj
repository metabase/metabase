(ns metabase-enterprise.serialization.v2.seed-entity-ids-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.seed-entity-ids
    :as v2.seed-entity-ids]
   [metabase.models :refer [Collection]]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.time LocalDateTime)))

(set! *warn-on-reflection* true)

(deftest seed-entity-ids-test
  (testing "Sanity check: should succeed before we go around testing specific situations"
    (is (true? (v2.seed-entity-ids/seed-entity-ids!))))
  (testing "With a temp Collection with no entity ID"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (t2.with-temp/with-temp [Collection c {:name       "No Entity ID Collection"
                                             :slug       "no_entity_id_collection"
                                             :created_at now
                                             :color      "#FF0000"}]
        (t2/update! Collection (:id c) {:entity_id nil})
        (letfn [(entity-id []
                  (some-> (t2/select-one-fn :entity_id Collection :id (:id c)) str/trim))]
          (is (= nil
                 (entity-id)))
          (testing "Should return truthy on success"
            (is (= true
                   (v2.seed-entity-ids/seed-entity-ids!))))
          (is (= "998b109c"
                 (entity-id))))
        (testing "Error: duplicate entity IDs"
          (t2.with-temp/with-temp [Collection c2 {:name       "No Entity ID Collection"
                                                  :slug       "no_entity_id_collection"
                                                  :created_at now
                                                  :color      "#FF0000"}]
            (t2/update! Collection (:id c2) {:entity_id nil})
            (letfn [(entity-id []
                      (some-> (t2/select-one-fn :entity_id Collection :id (:id c2)) str/trim))]
              (is (= nil
                     (entity-id)))
              (testing "Should return falsey on error"
                (is (= false
                       (v2.seed-entity-ids/seed-entity-ids!))))
              (is (= nil
                     (entity-id))))))))))
