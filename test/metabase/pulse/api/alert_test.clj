(ns metabase.pulse.api.alert-test
  "Tests for `/api/alert` endpoints."
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.notification.models :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.pulse.models.pulse :as models.pulse]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :notifications))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Helper Fns & Macros                                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn basic-alert []
  {:alert_condition  "rows"
   :alert_first_only false
   :creator_id       (mt/user->id :rasta)
   :name             nil})

(defn- basic-alert-query []
  {:name          "Foo"
   :dataset_query {:database (mt/id)
                   :type     :query
                   :query    {:source-table (mt/id :checkins)
                              :aggregation  [["count"]]
                              :breakout     [[:field (mt/id :checkins :date) {:temporal-unit :hour}]]}}})

(defn recipient [pulse-channel-or-id username-keyword]
  (let [user (mt/fetch-user username-keyword)]
    {:user_id          (u/the-id user)
     :pulse_channel_id (u/the-id pulse-channel-or-id)}))

(defn- alert-url [alert-or-id]
  (format "alert/%d" (u/the-id alert-or-id)))

(defn- sanitize-alert
  [data]
  (as-> data result
    (walk/postwalk
     (fn [x]
       (if (map? x)
         (-> x
             (dissoc :id :created_at :updated_at :entity_id :pulse_id)
             (update-vals (fn [v] (if (keyword? v)
                                    (u/qualified-name v)
                                    v))))
         x))
     result)
    (update result :channels #(sort-by :channel_type %))))

(deftest wrapper-get-alert-test
  (mt/with-temp [:model/Channel {chn-id :id} notification.tu/default-can-connect-channel]
    (notification.tu/with-card-notification
      [notification {:notification-card {:send_condition :goal_above
                                         :send_once      true}

                     :card              (basic-alert-query)
                     :subscriptions     [{:type :notification-subscription/cron
                                          ;; daily at 14:00
                                          :cron_schedule "0 0 14 ? * 4 *"}]
                     :handlers         [{:channel_type :channel/email
                                         :recipients   [{:type :notification-recipient/user
                                                         :user_id     (mt/user->id :rasta)}
                                                        {:type :notification-recipient/raw-value
                                                         :details {:value "ngoc@metabase.com"}}]}
                                        {:channel_type :channel/slack
                                         :recipients   [{:type :notification-recipient/raw-value
                                                         :details {:value "#general"}}]}
                                        {:channel_type :channel/http
                                         :channel_id   chn-id}]}]
      (let [schedule (dissoc (u.cron/cron-string->schedule-map "0 0 14 ? * 4 *") :schedule_minute)]
        (mt/with-temp [:model/Card card (basic-alert-query)
                       :model/Pulse alert {:name             nil
                                           :alert_condition  "goal"
                                           :alert_above_goal true
                                           :alert_first_only true
                                           :skip_if_empty    true
                                           :creator_id       (mt/user->id :crowberto)}
                       :model/PulseCard _  {:card_id     (:id card)
                                            :pulse_id    (:id alert)
                                            :include_csv true}
                       :model/PulseChannel email-channel (merge
                                                          schedule
                                                          {:pulse_id (:id alert)
                                                           :channel_type :email
                                                           :details {:emails ["ngoc@metabase.com"]}
                                                           :enabled true})
                       :model/PulseChannelRecipient _ (recipient email-channel :rasta)

                       :model/PulseChannel _ (merge schedule
                                                    {:pulse_id (:id alert)
                                                     :channel_type :slack
                                                     :details {:channel "#general"}
                                                     :enabled true})
                       :model/PulseChannel _ (merge schedule
                                                    {:pulse_id (:id alert)
                                                     :channel_type "http"
                                                     :channel_id chn-id
                                                     :enabled true})]

          (is (= (sanitize-alert
                  (mt/user-http-request :crowberto :get 200 (alert-url (:id notification))))
                 (sanitize-alert
                  (mt/with-current-user (mt/user->id :crowberto)
                    (models.pulse/retrieve-alert alert))))))))))

(deftest get-alerts-archived-test
  (notification.tu/with-card-notification
    [active-noti {}]
    (notification.tu/with-card-notification
      [archived-noti {:notification {:active false}}]
      (testing "by default only active alerts are returned"
        (is (= #{(:id active-noti)}
               (set (map :id (mt/user-http-request :crowberto :get 200 "alert"))))))

      (testing "can fetch archived alerts"
        (is (= #{(:id archived-noti)}
               (set (map :id (mt/user-http-request :crowberto :get 200 "alert" :archived true)))))))))

(deftest get-alerts-by-user-test
  (notification.tu/with-card-notification
    [crowberto-alert {:notification {:creator_id (mt/user->id :crowberto)}}]
    (notification.tu/with-card-notification
      [rasta-alert {:notification {:creator_id (mt/user->id :rasta)}}]
      (notification.tu/with-card-notification
        [rasta-recipient-alert {:notification {:creator_id (mt/user->id :crowberto)}
                                :handlers    [{:channel_type :channel/email
                                               :recipients  [{:type :notification-recipient/user
                                                              :user_id (mt/user->id :rasta)}]}]}]

        (testing "admin can see all alerts"
          (is (= #{(:id crowberto-alert) (:id rasta-alert) (:id rasta-recipient-alert)}
                 (set (map :id (mt/user-http-request :crowberto :get 200 "alert"))))))

        (testing "can fetch alerts by user_id - should include created and received alerts"
          (is (= #{(:id crowberto-alert) (:id rasta-recipient-alert)}
                 (set (map :id (mt/user-http-request :crowberto :get 200 "alert"
                                                     :user_id (mt/user->id :crowberto))))))

          (is (= #{(:id rasta-alert) (:id rasta-recipient-alert)}
                 (set (map :id (mt/user-http-request :crowberto :get 200 "alert"
                                                     :user_id (mt/user->id :rasta)))))))

        (testing "regular users can only see alerts they created or receive"
          (is (= #{(:id rasta-alert) (:id rasta-recipient-alert)}
                 (set (map :id (mt/user-http-request :rasta :get 200 "alert"))))))))))

(deftest get-alert-test
  (testing "an alert can be fetched by ID"
    (notification.tu/with-card-notification
      [notification {}]
      (is (= (:id notification)
             (:id (mt/user-http-request :crowberto :get 200 (alert-url notification)))))))

  (testing "fetching a non-existing alert returns an error"
    (mt/user-http-request :rasta :get 404 (str "alert/" Integer/MAX_VALUE))))

(deftest unsubscribe-alert-test
  (mt/with-model-cleanup [:model/Notification]
    (let [unsubscribe     (fn [user status thunk]
                            (notification.tu/with-card-notification
                              [{noti-id :id} {:notification {:creator_id (mt/user->id :crowberto)}
                                              :handlers     [{:channel_type "channel/email"
                                                              :recipients   [{:type    :notification-recipient/user
                                                                              :user_id (mt/user->id :crowberto)}
                                                                             {:type    :notification-recipient/user
                                                                              :user_id (mt/user->id :lucky)}]}]}]
                              (mt/user-http-request user :delete status (format "alert/%d/subscription" noti-id))
                              (thunk (models.notification/hydrate-notification (t2/select-one :model/Notification noti-id)))))
          email-recipients (fn [notification]
                             (->> notification :handlers (m/find-first #(= :channel/email (:channel_type %))) :recipients))]

      (testing "creator can unsubscribe themselves"
        (unsubscribe
         :crowberto 204
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :lucky)}]
                (email-recipients noti))))))

      (testing "recipient can unsubscribe themselves"
        (unsubscribe
         :lucky 204
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :crowberto)}]
                (email-recipients noti))))))

      (testing "non-recipient cannot unsubscribe"
        (unsubscribe
         :rasta 403
         (fn [noti]
           (is (=?
                [{:type    :notification-recipient/user
                  :user_id (mt/user->id :crowberto)}
                 {:type    :notification-recipient/user
                  :user_id (mt/user->id :lucky)}]
                (email-recipients noti)))))))))
