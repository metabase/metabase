(ns metabase-enterprise.serialization.v2.serialize-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Collection User]]
            [metabase.models.serialization.base :as serdes.base]
            [metabase-enterprise.serialization.v2.serialize :as sut]
            [metabase-enterprise.serialization.v2.models :as serdes.models]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]
            [toucan.models :as models]))

(deftest fundamentals-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{coll-id  :id coll-eid  :entity_id} {:name "Some Collection"}]
                       Collection [{child-id :id child-eid :entity_id} {:name "Nested Collection"
                                                                        :location (format "/%s/" coll-id)}]

                       User       [{mark-id :id} {:first_name "Mark"
                                                  :last_name  "Knopfler"
                                                  :email      "mark@direstrai.ts"}]
                       Collection [{pc-id  :id
                                    pc-eid :entity_id} {:name "Mark's Personal Collection"
                                                        :personal_owner_id mark-id}]]
      (testing "a top-level collection is serialized correctly"
        (let [[file ser] (serdes.base/serialize-one (Collection coll-id))]
          (is (= (format "Collection/%s.yaml" coll-eid) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:personal_owner_id ser)))
          (is (contains? ser :parent_id))
          (is (nil? (:parent_id ser)))
          (is (= "Collection" (:serdes_type ser)))))

      (testing "a nested collection is serialized with the right parent_id"
        (let [[file ser] (serdes.base/serialize-one (Collection child-id))]
          (is (= (format "Collection/%s.yaml" child-eid) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (= coll-eid (:parent_id ser)))
          (is (nil? (:personal_owner_id ser)))))

      (testing "personal collections are serialized with email as key"
        (let [[file ser] (serdes.base/serialize-one (Collection pc-id))]
          (is (= (format "Collection/%s.yaml" pc-eid) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:parent_id ser)))
          (is (= "mark@direstrai.ts" (:personal_owner_id ser))))))))
