(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.core :as api-key]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-key/unhashed-key "mb_1234567890"
                                                 :name                  (mt/random-name)
                                                 :user_id               (mt/user->id :crowberto)
                                                 :creator_id            (mt/user->id :crowberto)
                                                 :updated_by_id         (mt/user->id :crowberto)}]
    (is (= 1
           (t2/delete! :model/ApiKey api-key-id)))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))
