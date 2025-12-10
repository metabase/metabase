(ns metabase-enterprise.support-access-grants.api-test
  "Tests for /api/ee/support-access-grant endpoints."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [f] (mt/with-premium-features #{:support-users}
                              (f))))

(deftest api-requires-support-users-feature-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (mt/with-premium-features #{}
      (is (=? {:message "Support Users is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"}
              (mt/user-http-request :crowberto :post 402 "ee/support-access-grant"
                                    {:ticket_number "SUPPORT-12345"
                                     :grant_duration_minutes 240}))))))

(deftest create-grant-returns-grant-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [response (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                         {:ticket_number "SUPPORT-12345"
                                          :grant_duration_minutes 240})]
      (is (some? response))
      (is (= (mt/user->id :crowberto) (:user_id response)))
      (is (= "SUPPORT-12345" (:ticket_number response)))
      (is (some? (:grant_start_timestamp response)))
      (is (some? (:grant_end_timestamp response)))
      (is (nil? (:revoked_at response)))
      (is (nil? (:revoked_by_user_id response))))))

(deftest create-grant-fails-for-non-admin-test
  (is (= "You don't have permissions to do that."
         (mt/user-http-request :rasta :post 403 "ee/support-access-grant"
                               {:ticket_number "SUPPORT-12346"
                                :grant_duration_minutes 240}))))

(deftest create-grant-fails-when-active-grant-exists-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                          {:ticket_number "SUPPORT-12347"
                           :grant_duration_minutes 240})
    (is (= "Cannot create grant: an active grant already exists"
           (mt/user-http-request :crowberto :post 409 "ee/support-access-grant"
                                 {:ticket_number "SUPPORT-12348"
                                  :grant_duration_minutes 240})))))

(deftest create-grant-validates-max-duration-test
  (mt/user-http-request :crowberto :post 400 "ee/support-access-grant"
                        {:ticket_number "SUPPORT-12349"
                         :grant_duration_minutes 10081}))

(deftest create-grant-requires-duration-test
  (mt/user-http-request :crowberto :post 400 "ee/support-access-grant"
                        {:ticket_number "SUPPORT-12350"}))

(deftest revoke-grant-sets-revoked-fields-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [grant (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                      {:ticket_number "SUPPORT-22345"
                                       :grant_duration_minutes 240})
          grant-id (:id grant)
          revoked (mt/user-http-request :crowberto :put 200 (format "ee/support-access-grant/%d/revoke" grant-id))]
      (is (some? revoked))
      (is (some? (:revoked_at revoked)))
      (is (= (mt/user->id :crowberto) (:revoked_by_user_id revoked))))))

(deftest revoke-grant-fails-for-non-admin-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [grant (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                      {:ticket_number "SUPPORT-22347"
                                       :grant_duration_minutes 240})
          grant-id (:id grant)]
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :lucky :put 403 (format "ee/support-access-grant/%d/revoke" grant-id)))))))

(deftest revoke-grant-fails-for-nonexistent-grant-test
  (is (= "Not found."
         (mt/user-http-request :crowberto :put 404 "ee/support-access-grant/999999/revoke"))))

(deftest revoke-grant-fails-for-already-revoked-grant-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [grant (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                      {:ticket_number "SUPPORT-22348"
                                       :grant_duration_minutes 240})
          grant-id (:id grant)]
      (mt/user-http-request :crowberto :put 200 (format "ee/support-access-grant/%d/revoke" grant-id))
      (is (= "Grant is already revoked"
             (mt/user-http-request :crowberto :put 400 (format "ee/support-access-grant/%d/revoke" grant-id)))))))

(deftest list-grants-returns-paginated-results-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (dotimes [i 3]
      (t2/insert! :model/SupportAccessGrantLog
                  {:user_id (mt/user->id :crowberto)
                   :ticket_number (str "SUPPORT-3" i)
                   :grant_start_timestamp (t/instant)
                   :grant_end_timestamp (t/plus (t/instant) (t/minutes 240))}))
    (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant")]
      (is (map? response))
      (is (contains? response :data))
      (is (contains? response :total))
      (is (contains? response :limit))
      (is (contains? response :offset))
      (is (= 50 (:limit response)))
      (is (= 0 (:offset response)))
      (is (>= (count (:data response)) 3)))))

(deftest list-grants-fails-for-non-admin-test
  (is (= "You don't have permissions to do that."
         (mt/user-http-request :rasta :get 403 "ee/support-access-grant"))))

(deftest list-grants-respects-pagination-parameters-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant"
                                         :limit 2
                                         :offset 1)]
      (is (= 2 (:limit response)))
      (is (= 1 (:offset response))))))

(deftest list-grants-filters-by-ticket-number-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [ticket "SUPPORT-FILTER-TEST"]
        (t2/insert! :model/SupportAccessGrantLog
                    {:user_id user-id
                     :ticket_number ticket
                     :grant_start_timestamp (t/instant)
                     :grant_end_timestamp (t/plus (t/instant) (t/minutes 240))})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant"
                                             :ticket-number ticket)]
          (is (= 1 (count (:data response))))
          (is (= ticket (:ticket_number (first (:data response))))))))))

(deftest list-grants-filters-by-user-id-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (t2/insert! :model/SupportAccessGrantLog
                  {:user_id user-id
                   :ticket_number "SUPPORT-USER-FILTER"
                   :grant_start_timestamp (t/instant)
                   :grant_end_timestamp (t/plus (t/instant) (t/minutes 240))})
      (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant"
                                           :user-id user-id)]
        (is (>= (count (:data response)) 1))
        (is (every? #(= user-id (:user_id %)) (:data response)))))))

(deftest list-grants-excludes-revoked-by-default-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [now (t/instant)]
        (t2/insert! :model/SupportAccessGrantLog
                    {:user_id user-id
                     :ticket_number "SUPPORT-REVOKED"
                     :grant_start_timestamp now
                     :grant_end_timestamp (t/plus now (t/minutes 240))
                     :revoked_at now
                     :revoked_by_user_id user-id})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant"
                                             :ticket-number "SUPPORT-REVOKED")]
          (is (= 0 (count (:data response)))))))))

(deftest list-grants-includes-revoked-when-requested-test
  (mt/with-temp [:model/User {user-id :id} {}]
    (mt/with-model-cleanup [:model/SupportAccessGrantLog]
      (let [now (t/instant)]
        (t2/insert! :model/SupportAccessGrantLog
                    {:user_id user-id
                     :ticket_number "SUPPORT-REVOKED-2"
                     :grant_start_timestamp now
                     :grant_end_timestamp (t/plus now (t/minutes 240))
                     :revoked_at now
                     :revoked_by_user_id user-id})
        (let [response (mt/user-http-request :crowberto :get 200 "ee/support-access-grant"
                                             :ticket-number "SUPPORT-REVOKED-2"
                                             :include-revoked true)]
          (is (= 1 (count (:data response)))))))))

(deftest get-current-grant-returns-nil-when-no-grant-exists-test
  (let [response (mt/user-http-request :crowberto :get 204 "ee/support-access-grant/current")]
    (is (nil? response))))

(deftest get-current-grant-returns-active-grant-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [grant (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                      {:ticket_number "SUPPORT-CURRENT"
                                       :grant_duration_minutes 240})
          current (mt/user-http-request :crowberto :get 200 "ee/support-access-grant/current")]
      (is (some? current))
      (is (= (:id grant) (:id current))))))

(deftest get-current-grant-returns-nil-when-grant-revoked-test
  (mt/with-model-cleanup [:model/SupportAccessGrantLog]
    (let [grant (mt/user-http-request :crowberto :post 200 "ee/support-access-grant"
                                      {:ticket_number "SUPPORT-CURRENT-2"
                                       :grant_duration_minutes 240})
          grant-id (:id grant)]
      (mt/user-http-request :crowberto :put 200 (format "ee/support-access-grant/%d/revoke" grant-id))
      (let [current (mt/user-http-request :crowberto :get 204 "ee/support-access-grant/current")]
        (is (nil? current))))))

(deftest get-current-grant-fails-for-non-admin-test
  (is (= "You don't have permissions to do that."
         (mt/user-http-request :rasta :get 403 "ee/support-access-grant/current"))))
