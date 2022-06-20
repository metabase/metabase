(ns metabase-enterprise.serialization.v2.extract-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.extract :as sut]
            [metabase.models :refer [Collection User]]
            [metabase.models.serialization.base :as serdes.base]))

(deftest fundamentals-test
  (ts/with-empty-h2-app-db
    (ts/with-temp-dpc [Collection [{coll-id    :id
                                    coll-eid   :entity_id
                                    coll-slug  :slug}      {:name "Some Collection"}]
                       Collection [{child-id   :id
                                    child-eid  :entity_id
                                    child-slug :slug}      {:name "Nested Collection"
                                                            :location (format "/%s/" coll-id)}]

                       User       [{mark-id :id} {:first_name "Mark"
                                                  :last_name  "Knopfler"
                                                  :email      "mark@direstrai.ts"}]
                       Collection [{pc-id   :id
                                    pc-eid  :entity_id
                                    pc-slug :slug}     {:name "Mark's Personal Collection"
                                                        :personal_owner_id mark-id}]]

      (testing "a top-level collection is extracted correctly"
        (let [ser (serdes.base/extract-one (Collection coll-id))]
          (is (= {:type "Collection" :id coll-eid :label coll-slug} (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:personal_owner_id ser)))
          (is (contains? ser :parent_id))
          (is (nil? (:parent_id ser)))))

      (testing "a nested collection is extracted with the right parent_id"
        (let [ser (serdes.base/extract-one (Collection child-id))]
          (is (= {:type "Collection" :id child-eid :label child-slug} (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (= coll-eid (:parent_id ser)))
          (is (nil? (:personal_owner_id ser)))))

      (testing "personal collections are extracted with email as key"
        (let [ser (serdes.base/extract-one (Collection pc-id))]
          (is (= {:type "Collection" :id pc-eid :label pc-slug} (:serdes/meta ser)))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:parent_id ser)))
          (is (= "mark@direstrai.ts" (:personal_owner_id ser)))))

      (testing "overall extraction returns the expected set"
        (letfn [(collections [extraction] (->> extraction
                                               (into [])
                                               (map :serdes/meta)
                                               (filter #(= "Collection" (:type %)))
                                               (map :id)
                                               set))]
          (testing "no user specified"
            (is (= #{coll-eid child-eid}
                   (collections (sut/extract-metabase nil)))))

          (testing "valid user specified"
            (is (= #{coll-eid child-eid pc-eid}
                   (collections (sut/extract-metabase {:user mark-id})))))

          (testing "invalid user specified"
            (is (= #{coll-eid child-eid}
                   (collections (sut/extract-metabase {:user 218921}))))))))))
