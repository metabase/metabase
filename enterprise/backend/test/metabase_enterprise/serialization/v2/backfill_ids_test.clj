(ns ^:mb/once metabase-enterprise.serialization.v2.backfill-ids-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase.models :refer [Collection]]
   [toucan.db :as db]))

(deftest backfill-needed-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{c1-id :id} {:name "some collection"}]
                       Collection [{c2-id :id} {:name "other collection"}]
                       ;; These two deliberately have the same name!
                       Collection [{c3-id :id} {:name     "child collection"
                                                :location (str "/" c1-id "/")}]
                       Collection [{c4-id :id} {:name     "child collection"
                                                :location (str "/" c2-id "/")}]]

      (let [coll-ids [c1-id c2-id c3-id c4-id]
            all-eids #(db/select-field :entity_id Collection :id [:in coll-ids])]
        (testing "all collections have entity_ids"
          (is (every? some? (all-eids))))

        (testing "removing the entity_ids"
          (doseq [id coll-ids]
            (db/update! Collection id :entity_id nil))
          (is (every? nil? (all-eids))))

        (testing "backfill now recreates them"
          (serdes.backfill/backfill-ids-for Collection)
          (is (every? some? (all-eids))))))))

(deftest no-overwrite-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{c1-id :id c1-eid :entity_id} {:name "some collection"}]
                       Collection [{c2-id :id}                   {:name "other collection"}]]
      (testing "deleting the entity_id for one of them"
        (db/update! Collection c2-id {:entity_id nil})
        (is (= #{c1-eid nil}
               (db/select-field :entity_id Collection))))

      (testing "backfill"
        (serdes.backfill/backfill-ids-for Collection)
        (testing "sets a blank entity_id"
          (is (some? (db/select-one-field :entity_id Collection :id c2-id))))
        (testing "does not change the original entity_id"
          (is (= c1-eid (db/select-one-field :entity_id Collection :id c1-id))))))))

(deftest repeatable-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{c1-eid :entity_id} {:name "some collection"}]
                       Collection [{c2-id :id}         {:name "other collection"}]]
      (testing "deleting the entity_id for one of them"
        (db/update! Collection c2-id {:entity_id nil})
        (is (= #{c1-eid nil}
               (db/select-field :entity_id Collection))))

      (testing "backfilling twice"
        (serdes.backfill/backfill-ids-for Collection)
        (let [first-eid (db/select-one-field :entity_id Collection :id c2-id)]
          (db/update! Collection c2-id {:entity_id nil})
          (is (= #{c1-eid nil}
                 (db/select-field :entity_id Collection)))
          (serdes.backfill/backfill-ids-for Collection)
          (testing "produces the same entity_id both times"
            (is (= first-eid (db/select-one-field :entity_id Collection :id c2-id)))))))))
