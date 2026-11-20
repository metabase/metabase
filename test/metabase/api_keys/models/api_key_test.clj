(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.test :refer :all]
   [metabase.api-keys.core :as api-key]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-key/unhashed-key "mb_1234567890"
                                                 :name                  (mt/random-name)
                                                 :user_id               (mt/user->id :crowberto)
                                                 :creator_id            (mt/user->id :crowberto)
                                                 :updated_by_id         (mt/user->id :crowberto)}]
    (is (= 1
           (api-key/delete-api-key! api-key-id {})))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))

(deftest update-api-key-publishes-update-event-test
  (let [published (atom [])]
    (events/register-owned-consumer! ::api-key-events
                                     (fn [{:keys [model]}] (when (= :model/ApiKey model) :api-key))
                                     (fn [_owner events _all] (swap! published into events)))
    (try
      (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-key/unhashed-key "mb_0987654321"
                                                     :name                  "Test Key"
                                                     :user_id               (mt/user->id :crowberto)
                                                     :creator_id            (mt/user->id :crowberto)
                                                     :updated_by_id         (mt/user->id :crowberto)}]
        (reset! published [])
        (mt/with-test-user :crowberto
          (api-key/update-api-key! api-key-id {:name "Renamed Key"} {}))
        (testing "one update event with the row before and after the update"
          (is (=? [{:operation       :update
                    :id              api-key-id
                    :user-id         (mt/user->id :crowberto)
                    :previous-object {:name "Test Key"}
                    :object          {:name "Renamed Key"}}]
                  @published))))
      (finally
        (events.tu/unregister! ::api-key-events)))))

(deftest update-api-key-query-count-test
  (testing "a rename through update-api-key! issues no more queries than master's t2/update! with the hooks: 5"
    (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-key/unhashed-key "mb_1122334455"
                                                   :name                  "Test Key"
                                                   :user_id               (mt/user->id :crowberto)
                                                   :creator_id            (mt/user->id :crowberto)
                                                   :updated_by_id         (mt/user->id :crowberto)}]
      (api-key/update-api-key! api-key-id {:name "Warm Key"} {})
      (t2/with-call-count [call-count]
        (api-key/update-api-key! api-key-id {:name "Renamed Key"} {})
        (is (<= (call-count) 5))))))
