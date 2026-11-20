(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.core :as api-key]
   [metabase.test :as mt]
   [metabase.util.encryption :as encryption]
   [metabase.util.password :as u.password]
   [toucan2.core :as t2]))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-key/unhashed-key "mb_1234567890"
                                                 :name                  (mt/random-name)
                                                 :user_id               (mt/user->id :crowberto)
                                                 :creator_id            (mt/user->id :crowberto)
                                                 :updated_by_id         (mt/user->id :crowberto)}]
    (is (= 1
           (t2/delete! :model/ApiKey :id api-key-id)))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))

(deftest plain-update-with-unhashed-key-hashes-for-scope-test
  (testing "plain update with new unhashed key stores its prefix and its hash salted for key's scope"
    (doseq [[scope salt] [[nil ""] [:workspace-manager "workspace-manager:"]]]
      (testing (str "scope " scope)
        (mt/with-temp [:model/ApiKey {api-key-id :id} (cond-> {::api-key/unhashed-key "mb_oldkey1234567"
                                                               :name                  (mt/random-name)
                                                               :user_id               (mt/user->id :crowberto)
                                                               :creator_id            (mt/user->id :crowberto)
                                                               :updated_by_id         (mt/user->id :crowberto)}
                                                        scope (assoc :scope scope))]
          (t2/update! :model/ApiKey :id api-key-id {::api-key/unhashed-key "mb_newkey7654321"})
          (let [{stored :key, :keys [key_prefix]} (t2/select-one :model/ApiKey :id api-key-id)
                stored                            (encryption/maybe-decrypt stored)]
            (is (= "mb_newk" key_prefix))
            (is (true? (u.password/verify-password "mb_newkey7654321" salt stored)))
            (is (false? (u.password/verify-password "mb_oldkey1234567" salt stored)))))))))
