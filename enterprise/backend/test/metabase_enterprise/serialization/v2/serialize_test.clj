(ns metabase-enterprise.serialization.v2.serialize-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase-enterprise.serialization.v2.serialize :as sut]
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

      (testing "a top-level collection is serialized correctly"
        (let [[file ser] (serdes.base/serialize-one (Collection coll-id))]
          (is (= (format "Collection/%s+%s.yaml" coll-eid coll-slug) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:personal_owner_id ser)))
          (is (contains? ser :parent_id))
          (is (nil? (:parent_id ser)))
          (is (= "Collection" (:serdes_type ser)))))

      (testing "a nested collection is serialized with the right parent_id"
        (let [[file ser] (serdes.base/serialize-one (Collection child-id))]
          (is (= (format "Collection/%s+%s.yaml" child-eid child-slug) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (= coll-eid (:parent_id ser)))
          (is (nil? (:personal_owner_id ser)))))

      (testing "personal collections are serialized with email as key"
        (let [[file ser] (serdes.base/serialize-one (Collection pc-id))]
          (is (= (format "Collection/%s+%s.yaml" pc-eid pc-slug) file))
          (is (not (contains? ser :location)))
          (is (not (contains? ser :id)))
          (is (nil? (:parent_id ser)))
          (is (= "mark@direstrai.ts" (:personal_owner_id ser)))))

      (testing "overall serialization returns the expected set"
        (testing "no user specified"
          (let [files (into {} (sut/serialize-metabase nil))]
            (is (= #{(format "Collection/%s+%s.yaml" coll-eid  coll-slug)
                     (format "Collection/%s+%s.yaml" child-eid child-slug)
                     "settings.yaml"}
                   (into #{} (keys files))))))

        (testing "valid user specified"
          (let [files (into {} (sut/serialize-metabase mark-id))]
            (is (= #{(format "Collection/%s+%s.yaml" coll-eid  coll-slug)
                     (format "Collection/%s+%s.yaml" child-eid child-slug)
                     (format "Collection/%s+%s.yaml" pc-eid    pc-slug)
                     "settings.yaml"}
                   (into #{} (keys files))))))

        (testing "invalid user specified"
          (let [files (into {} (sut/serialize-metabase 218921))]
            (is (= #{(format "Collection/%s+%s.yaml" coll-eid  coll-slug)
                     (format "Collection/%s+%s.yaml" child-eid child-slug)
                     "settings.yaml"}
                   (into #{} (keys files))))))))))
