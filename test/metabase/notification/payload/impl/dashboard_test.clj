(ns metabase.notification.payload.impl.dashboard-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.core :as notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(use-fixtures
  :each
  (fn [thunk]
    (binding [notification.send/*default-options* {:notification/sync? true}]
      (thunk))))

(def ^:private dashboard-name "Test Dashboard Subscription")

(deftest basic-dashboard-notification-test
  (testing "dashboard notification sends email and slack messages with correct content"
    (notification.tu/with-notification-testing-setup!
      (notification.tu/with-dashboard-notification
        [notification {:dashboard {:name dashboard-name}
                       :handlers  [@notification.tu/default-email-handler
                                   notification.tu/default-slack-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)]
          (mt/with-temp [:model/Card          {card-id :id} {:name          "Test Card"
                                                             :dataset_query (mt/native-query {:query "SELECT 'hello world' as msg"})}
                         :model/DashboardCard _              {:dashboard_id dashboard-id
                                                              :card_id      card-id}]
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [[email]]
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name)
                               #"Manage your subscriptions"
                               #"hello world")]
                  (testing "email subject is the dashboard name"
                    (is (= dashboard-name (:subject summary))))
                  (testing "email is sent to the correct recipient"
                    (is (= #{"rasta@metabase.com"} (:recipients summary))))
                  (testing "email body contains dashboard name"
                    (is (true? (get (first (:message summary)) dashboard-name))))
                  (testing "email body contains management link"
                    (is (true? (get (first (:message summary)) "Manage your subscriptions"))))
                  (testing "email body contains card content"
                    (is (true? (get (first (:message summary)) "hello world"))))))

              :channel/slack
              (fn [[message]]
                (let [msg (notification.tu/slack-message->boolean message)]
                  (testing "slack message is sent to the correct channel"
                    (is (= "#general" (:channel msg))))))})))))))

(deftest skip-if-empty-with-results-test
  (testing "dashboard with results is NOT skipped when skip_if_empty is true"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty true}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 1 (count emails))))}))))))

(deftest skip-if-empty-no-results-test
  (testing "dashboard with empty results IS skipped when skip_if_empty is true"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty true}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT NULL"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (empty? emails)))}))))))

(deftest no-skip-when-flag-is-false-test
  (testing "dashboard with empty results is NOT skipped when skip_if_empty is false"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty false}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT NULL"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 1 (count emails))))}))))))

(deftest skip-if-empty-mixed-results-test
  (testing "dashboard with mix of empty and non-empty cards is NOT skipped when skip_if_empty is true"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty true}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {empty-card-id :id} {:dataset_query (mt/native-query {:query "SELECT NULL"})}
                       :model/DashboardCard _                   {:dashboard_id dashboard-id
                                                                 :card_id      empty-card-id}
                       :model/Card          {full-card-id :id}  {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                       :model/DashboardCard _                   {:dashboard_id dashboard-id
                                                                 :card_id      full-card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 1 (count emails))))}))))))

(deftest dashboard-rows-saved-to-disk-cleanup-test
  (testing "temp files created for dashboard card results are cleaned up after send"
    (let [rows-atom       (atom nil)
          orig-execute-fn @#'notification.payload.execute/execute-dashboard-subscription-card]
      (with-redefs [notification.payload.execute/cells-to-disk-threshold           1
                    notification.payload.execute/execute-dashboard-subscription-card
                    (fn [& args]
                      (let [result (apply orig-execute-fn args)]
                        (when result
                          (reset! rows-atom (-> result :result :data :rows)))
                        result))]
        (notification.tu/with-notification-testing-setup!
          (notification.tu/with-dashboard-notification
            [notification {:handlers [@notification.tu/default-email-handler]}]
            (let [dashboard-id (-> notification :payload :dashboard_id)]
              (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/mbql-query orders {:limit 2})}
                             :model/DashboardCard _              {:dashboard_id dashboard-id
                                                                  :card_id      card-id}]
                (notification/send-notification! notification)
                (testing "sanity check that the rows were saved to disk"
                  (is (notification.payload/cleanable? @rows-atom)))
                (testing "the files are cleaned up after send"
                  (is (not (.exists ^java.io.File
                            (.file ^metabase.notification.payload.temp_storage.StreamingTempFileStorage
                             @rows-atom)))))))))))))

(deftest audit-subscription-send-event-test
  (testing "When we send a dashboard subscription, the event is logged"
    (mt/when-ee-evailable
     (mt/with-premium-features #{:audit-app}
       (notification.tu/with-dashboard-notification
         [notification {:handlers [{:channel_type :channel/email
                                    :recipients   [{:type    :notification-recipient/user
                                                    :user_id (mt/user->id :rasta)}
                                                   {:type    :notification-recipient/raw-value
                                                    :details {:value "external@example.com"}}]}]}]
         (let [dashboard-id (-> notification :payload :dashboard_id)]
           (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                          :model/DashboardCard _              {:dashboard_id dashboard-id
                                                               :card_id      card-id}]
             (notification/send-notification! notification :notification/sync? true)
             (is (=? {:topic    :subscription-send
                      :user_id  (mt/user->id :crowberto)
                      :model    "Pulse"
                      :model_id (:id notification)
                      :details  {:recipients [{:id (mt/user->id :rasta)}
                                              "external@example.com"]
                                 :filters    nil}}
                     (mt/latest-audit-log-entry :subscription-send (:id notification)))))))))))
