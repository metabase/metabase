(ns metabase.collections.events.personal-collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel user-insert-creates-personal-collection-test
  (testing "inserting a User creates their Personal Collection, whichever path created the User (#78430)"
    (mt/with-temp [:model/User {user-id :id}]
      (is (=? {:personal_owner_id user-id
               :location          "/"}
              (t2/select-one :model/Collection :personal_owner_id user-id))))))

(deftest ^:parallel personal-collection-is-named-after-the-user-test
  (testing "the Collection created at insert time is the same one the lazy hydration path would have made"
    (mt/with-temp [:model/User {user-id :id} {:first_name "Case" :last_name "Study"}]
      (is (= "Case Study's Personal Collection"
             (t2/select-one-fn :name :model/Collection :personal_owner_id user-id)))
      (testing "and hydrating :personal_collection_id finds it rather than creating a second one"
        (is (= user-id
               (:personal_owner_id (t2/select-one :model/Collection :personal_owner_id user-id))))
        (is (= 1 (t2/count :model/Collection :personal_owner_id user-id)))))))

(deftest ^:parallel api-key-users-get-no-personal-collection-test
  (testing "API key Users are still skipped, as they are on the lazy path"
    (mt/with-temp [:model/User {user-id :id} {:type :api-key}]
      (is (nil? (t2/select-one :model/Collection :personal_owner_id user-id))))))
