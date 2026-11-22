(ns metabase.users.deactivation-test
  "Each path that deactivates Users ends their sessions and revokes their OAuth tokens in the transaction of the write."
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.session.models.session :as session.models]
   [metabase.test :as mt]
   [metabase.users.access-test-util :as access.tu]
   [metabase.users.models.user :as user]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest rest-api-deactivation-revokes-access-test
  (mt/with-temp [:model/User {user-id :id}      {}
                 :model/User {bystander-id :id} {}]
    (mt/with-model-cleanup [:model/OAuthAccessToken]
      (let [access           (access.tu/give-access! user-id)
            bystander-access (access.tu/give-access! bystander-id)]
        (mt/user-http-request :crowberto :delete 200 (str "user/" user-id))
        (is (= access.tu/revoked (access.tu/access-state access)))
        (is (= access.tu/live (access.tu/access-state bystander-access))
            "access of another User stays")))))

(deftest api-key-deletion-revokes-access-test
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (mt/with-model-cleanup [:model/OAuthAccessToken]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "deleting one key"
          (let [{key-id :id user-id :user_id} (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)})
                access                        (access.tu/give-access! user-id)]
            (api-key/delete-api-key! key-id)
            (is (= access.tu/revoked (access.tu/access-state access)))
            (is (false? (t2/select-one-fn :is_active :model/User :id user-id)))))
        (testing "deleting every key of a scope"
          (let [keys     (repeatedly 2 #(api-key/create-api-key-with-new-user! {:key-name (mt/random-name)
                                                                                :scope    :workspace-manager}))
                accesses (mapv (comp access.tu/give-access! :user_id) keys)]
            (is (= 2 (api-key/delete-api-keys-with-scope! :workspace-manager)))
            (is (= [access.tu/revoked access.tu/revoked] (mapv access.tu/access-state accesses)))))))))

(deftest failing-revocation-fails-deactivation-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/OAuthAccessToken]
      (let [access (access.tu/give-access! user-id)]
        (mt/with-dynamic-fn-redefs [session.models/end-sessions! (fn [& _] (throw (ex-info "revocation failed" {})))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"revocation failed"
                                (user/update-users! [user-id] {:is_active false}))))
        (is (true? (t2/select-one-fn :is_active :model/User :id user-id))
            "the deactivation is rolled back with the revocation")
        (is (= access.tu/live (access.tu/access-state access)))))))
