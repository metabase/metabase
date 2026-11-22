(ns metabase.api-keys.models.api-key-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api-keys.core :as-alias api-keys]
   [metabase.api-keys.models.api-key :as api-key]
   [metabase.api-keys.models.api-key-usage-log :as api-key-usage-log]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest do-not-mark-user-inactive-when-deleting-api-key-for-normal-user-test
  (mt/with-temp [:model/ApiKey {api-key-id :id} {::api-keys/unhashed-key "mb_1234567890"
                                                 :name                  (mt/random-name)
                                                 :user_id               (mt/user->id :crowberto)
                                                 :creator_id            (mt/user->id :crowberto)
                                                 :updated_by_id         (mt/user->id :crowberto)}]
    (api-key/delete-api-keys! [api-key-id])
    (is (not (t2/exists? :model/ApiKey :id api-key-id)))
    (is (true? (t2/select-one-fn :is_active :model/User :id (mt/user->id :crowberto))))))

(deftest delete-api-key-deactivates-its-user-test
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (let [{key-id :id user-id :user_id} (mt/with-current-user (mt/user->id :crowberto)
                                          (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)}))]
      (is (true? (t2/select-one-fn :is_active :model/User :id user-id)))
      (api-key/delete-api-keys! [key-id])
      (is (false? (t2/select-one-fn :is_active :model/User :id user-id))))))

(deftest update-api-key-renames-its-user-test
  (mt/with-model-cleanup [:model/ApiKey :model/User]
    (let [{key-id :id user-id :user_id} (mt/with-current-user (mt/user->id :crowberto)
                                          (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)}))]
      (api-key/update-api-keys! [{:id key-id :name "Renamed key"}])
      (is (= "Renamed key" (t2/select-one-fn :name :model/ApiKey :id key-id)))
      (is (= "Renamed key" (t2/select-one-fn :first_name :model/User :id user-id))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/User {admin-id :id} {:is_superuser true}]
    (mt/with-model-cleanup [:model/ApiKeyUsageLog :model/ApiKey :model/User]
      (testing "creating keys"
        (let [counted (fn [n]
                        (let [rows (vec (repeatedly n #(hash-map ::api-keys/unhashed-key (api-key/key-with-unique-prefix)
                                                                 :name                  (mt/random-name)
                                                                 :user_id               admin-id
                                                                 :creator_id            admin-id
                                                                 :updated_by_id         admin-id)))]
                          (events.tu/statement-count! #(api-key/create-api-keys! rows))))]
          (counted 1)
          (is (= (counted 2) (counted 6)))))
      (testing "deleting keys, half of them with a user of their own"
        (let [counted (fn [n]
                        (let [ids (mt/with-current-user admin-id
                                    (mapv (fn [i]
                                            (if (even? i)
                                              (:id (api-key/create-api-key-with-new-user! {:key-name (mt/random-name)}))
                                              (:id (first (api-key/create-api-keys!
                                                           [{::api-keys/unhashed-key (api-key/key-with-unique-prefix)
                                                             :name                  (mt/random-name)
                                                             :user_id               admin-id
                                                             :creator_id            admin-id
                                                             :updated_by_id         admin-id}])))))
                                          (range n)))]
                          (events.tu/statement-count! #(api-key/delete-api-keys! ids))))]
          (counted 1)
          (is (= (counted 2) (counted 6)))))
      (testing "recording key usage"
        (let [[{api-key-id :id}] (api-key/create-api-keys! [{::api-keys/unhashed-key (api-key/key-with-unique-prefix)
                                                             :name                  (mt/random-name)
                                                             :user_id               admin-id
                                                             :creator_id            admin-id
                                                             :updated_by_id         admin-id}])
              counted            (fn [n]
                                   (events.tu/statement-count!
                                    #(api-key-usage-log/create-api-key-usage-logs!
                                      (vec (repeat n {:api_key_id       api-key-id
                                                      :user_id          admin-id
                                                      :created_by_id    nil
                                                      :route_template   "/api/user/current"
                                                      :http_method      "GET"
                                                      :status           200
                                                      :duration_ms      1
                                                      :occurred_at      (t/offset-date-time)
                                                      :client_name      "test"
                                                      :embedding_client nil
                                                      :embedding_hostname nil})))))]
          (counted 1)
          (is (= (counted 2) (counted 6))))))))
