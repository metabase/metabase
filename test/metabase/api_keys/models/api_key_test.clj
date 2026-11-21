(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_1234567890"
                                                 :name                  (mt/random-name)
                                                 :user_id               (mt/user->id :crowberto)
                                                 :creator_id            (mt/user->id :crowberto)
                                                 :updated_by_id         (mt/user->id :crowberto)}]
    (is (= 1
           (api-key/delete-api-key! api-key-id)))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))

(deftest delete-api-key-deactivates-its-user-test
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (let [{key-id :id user-id :user_id} (mt/with-current-user (mt/user->id :crowberto)
                                          (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)}))]
      (is (true? (t2/select-one-fn :is_active :model/User :id user-id)))
      (is (= 1 (api-key/delete-api-key! key-id)))
      (is (false? (t2/select-one-fn :is_active :model/User :id user-id))))))

(deftest update-api-key-renames-its-user-test
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (let [{key-id :id user-id :user_id} (mt/with-current-user (mt/user->id :crowberto)
                                          (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)}))]
      (api-key/update-api-key! key-id {:name "Renamed key"})
      (is (= "Renamed key" (t2/select-one-fn :name :model/ApiKey :id key-id)))
      (is (= "Renamed key" (t2/select-one-fn :first_name :model/User :id user-id))))))
