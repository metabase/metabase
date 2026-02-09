(ns metabase.notification.payload.impl.dashboard-test
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.channel.core :as channel]
   [metabase.notification.core :as notification]
   [metabase.notification.payload.core :as notification.payload]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :each
  (fn [thunk]
    (binding [notification.send/*default-options* {:notification/sync? true}]
      (thunk))))

(def ^:private dashboard-name "Test Dashboard Subscription")

;; ------------------------------------------------------------------------------------------------;;
;;                                     Basic send tests                                            ;;
;; ------------------------------------------------------------------------------------------------;;

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

(deftest basic-line-graph-dashboard-test
  (testing "dashboard notification with a line graph card includes static visualization"
    (notification.tu/with-notification-testing-setup!
      (notification.tu/with-dashboard-notification
        [notification {:dashboard {:name dashboard-name}
                       :handlers  [@notification.tu/default-email-handler
                                   notification.tu/default-slack-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)]
          (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/mbql-query orders {:aggregation [["count"]]
                                                                                                   :breakout    [!day.created_at]})
                                                             :display       :line}
                         :model/DashboardCard _              {:dashboard_id dashboard-id
                                                              :card_id      card-id}]
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [[email]]
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name))]
                  (testing "email subject is the dashboard name"
                    (is (= dashboard-name (:subject summary))))
                  (testing "email has png attachment (static viz)"
                    (is (some #(= "image/png" (:content-type %)) (:message email))))))

              :channel/slack
              (fn [[message]]
                (testing "slack message is sent to the correct channel"
                  (is (= "#general" (:channel (notification.tu/slack-message->boolean message))))))})))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                   Multiple recipients                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest multiple-email-recipients-test
  (testing "dashboard notification is sent to multiple recipients (users + raw emails)"
    (notification.tu/with-dashboard-notification
      [notification {:handlers [{:channel_type :channel/email
                                 :recipients   [{:type    :notification-recipient/user
                                                 :user_id (mt/user->id :crowberto)}
                                                {:type    :notification-recipient/user
                                                 :user_id (mt/user->id :rasta)}
                                                {:type    :notification-recipient/raw-value
                                                 :details {:value "external@metabase.com"}}]}]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= #{#{"external@metabase.com"} #{"crowberto@metabase.com" "rasta@metabase.com"}}
                     (->> emails
                          (map (comp set :recipients))
                          set))))}))))))

(deftest non-user-email-test
  (testing "dashboard notification to non-user email shows Unsubscribe instead of Manage"
    (notification.tu/with-dashboard-notification
      [notification {:handlers [{:channel_type :channel/email
                                 :recipients   [{:type    :notification-recipient/raw-value
                                                 :details {:value "external@metabase.com"}}]}]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [[email]]
              (testing "email is sent correctly"
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name)
                               #"Manage your subscriptions"
                               #"Unsubscribe")]
                  (testing "non-user email does NOT see Manage link"
                    (is (false? (get (first (:message summary)) "Manage your subscriptions"))))
                  (testing "non-user email sees Unsubscribe link"
                    (is (true? (get (first (:message summary)) "Unsubscribe"))))))

              (testing "the unsubscribe url is correct"
                ;; Dashboard template uses {{management_url}} (double braces) which HTML-escapes
                ;; & → &amp; and = → &#x3D;
                (let [html    (-> email :message first :content)
                      raw-url (re-find #"https://[^/]+/unsubscribe[^\"\s<>]*" html)
                      url     (-> raw-url (str/replace "&amp;" "&") (str/replace "&#x3D;" "="))
                      params  (codec/form-decode (second (str/split url #"\?")))]
                  (is (int? (parse-long (get params "pulse-id"))))
                  (is (= "external@metabase.com" (get params "email")))
                  (is (string? (get params "hash"))))))}))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                     Skip-if-empty tests                                         ;;
;; ------------------------------------------------------------------------------------------------;;

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

;; ------------------------------------------------------------------------------------------------;;
;;                               Rows-to-disk and cleanup tests                                    ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest dashboard-rows-saved-to-disk-all-channels-test
  (testing "whether the rows of a card saved to disk or in memory, all channels should work"
    (doseq [limit [1 10]]
      (with-redefs [notification.payload.execute/cells-to-disk-threshold 5]
        (testing (if (> limit @#'notification.payload.execute/cells-to-disk-threshold)
                   "card has rows saved to disk"
                   "card has rows saved in memory")
          (notification.tu/with-notification-testing-setup!
            (notification.tu/with-dashboard-notification
              [notification {:dashboard {:name dashboard-name}
                             :handlers  [@notification.tu/default-email-handler
                                         notification.tu/default-slack-handler]}]
              (let [dashboard-id (-> notification :payload :dashboard_id)]
                (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/mbql-query orders {:limit limit})}
                               :model/DashboardCard _              {:dashboard_id dashboard-id
                                                                    :card_id      card-id}]
                  (notification.tu/test-send-notification!
                   notification
                   {:channel/email
                    (fn [[email]]
                      (let [summary (mt/summarize-multipart-single-email
                                     email
                                     (re-pattern dashboard-name))]
                        (is (= dashboard-name (:subject summary)))))
                    :channel/slack
                    (fn [[message]]
                      (is (= "#general" (:channel (notification.tu/slack-message->boolean message)))))}))))))))))

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

;; ------------------------------------------------------------------------------------------------;;
;;                                    Constraint/limit tests                                       ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- email->attachment-line-count
  [email]
  (let [attachment (m/find-first #(= "text/csv" (:content-type %)) (:message email))]
    (when attachment
      (with-open [rdr (io/reader (:content attachment))]
        (count (line-seq rdr))))))

(deftest dashboard-attachment-limit-test
  (testing "respect attachment limit env if set"
    (mt/with-temporary-setting-values [attachment-row-limit 10]
      (notification.tu/with-dashboard-notification
        [notification {:handlers [@notification.tu/default-email-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)
              nd-id        (-> notification :payload :id)]
          (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/mbql-query orders)}
                         :model/DashboardCard _              {:dashboard_id dashboard-id
                                                              :card_id      card-id}]
            ;; Update dashcards config with actual card_id so assoc-attachment-booleans can match
            (t2/update! :model/NotificationDashboard nd-id
                        {:dashboard_subscription_dashcards [{:card_id card-id :include_csv true}]})
            ;; dissoc :payload to force re-hydration from DB (t2/hydrate skips already-hydrated keys)
            (notification.tu/test-send-notification!
             (dissoc notification :payload)
             {:channel/email
              (fn [[email]]
                ;; 10 data rows + 1 header row = 11 lines
                (is (= 11 (email->attachment-line-count email))))})))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                     Permission tests                                            ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest permission-test
  (testing "dashboard subscription respects collection permissions of the creator"
    (mt/with-temp [:model/Collection coll {}]
      (letfn [(payload! [user-kw]
                (notification.tu/with-dashboard-notification
                  [notification {:dashboard    {:collection_id (:id coll)}
                                 :notification {:creator_id (mt/user->id user-kw)}}]
                  (let [dashboard-id (-> notification :payload :dashboard_id)]
                    (mt/with-temp [:model/Card          {card-id :id} {:collection_id (:id coll)
                                                                       :dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                                   :model/DashboardCard _              {:dashboard_id dashboard-id
                                                                        :card_id      card-id}]
                      (perms/revoke-collection-permissions! (perms/all-users-group) coll)
                      (get-in (notification/notification-payload notification)
                              [:payload :dashboard_parts])))))]
        (testing "rasta has no permissions and gets empty dashboard parts (card query fails silently)"
          ;; Dashboard card queries that fail return nil (caught by try/catch in execute-dashboard-subscription-card)
          (is (empty? (payload! :rasta))))
        (testing "crowberto can see the card and gets results"
          (is (seq (payload! :crowberto))))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                  Partial failure tests                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest partial-channel-failure-will-deliver-all-that-success-test
  (testing "if one channel fails, the other channels should still receive the message"
    (notification.tu/with-send-notification-sync
      (notification.tu/with-dashboard-notification
        [notification {:handlers [@notification.tu/default-email-handler
                                  notification.tu/default-slack-handler]}]
        (let [dashboard-id      (-> notification :payload :dashboard_id)
              original-render   (var-get #'channel/render-notification)]
          (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})}
                         :model/DashboardCard _              {:dashboard_id dashboard-id
                                                              :card_id      card-id}]
            (with-redefs [channel/render-notification (fn [& args]
                                                        (if (= :channel/slack (first args))
                                                          (throw (ex-info "Slack failed" {}))
                                                          (apply original-render args)))]
              ;; slack failed but email should still be sent
              (notification.tu/test-send-notification!
               notification
               {:channel/email
                (fn [emails]
                  (is (pos-int? (count emails))))
                :channel/slack
                (fn [messages]
                  (is (nil? messages)))}))))))))

;; ------------------------------------------------------------------------------------------------;;
;;                               Archived / invalid card tests                                     ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest archived-card-on-dashboard-test
  (testing "archived cards on a dashboard are silently skipped during subscription send"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty true}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})
                                                           :archived      true}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      card-id}]
          (testing "with skip_if_empty=true, archived card is treated as empty → skipped"
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [emails]
                (is (empty? emails)))})))))))

(deftest archived-card-with-skip-false-test
  (testing "archived cards on a dashboard are skipped but dashboard still sends when skip_if_empty is false"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty false}
                     :handlers              [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {archived-id :id} {:dataset_query (mt/native-query {:query "SELECT 1 as data"})
                                                               :archived      true}
                       :model/DashboardCard _                  {:dashboard_id dashboard-id
                                                                :card_id      archived-id}
                       :model/Card          {live-id :id}      {:dataset_query (mt/native-query {:query "SELECT 'alive' as msg"})}
                       :model/DashboardCard _                  {:dashboard_id dashboard-id
                                                                :card_id      live-id}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 1 (count emails))))}))))))

(deftest card-query-failure-on-dashboard-test
  (testing "a card with a failing query does not crash the entire dashboard subscription"
    (notification.tu/with-dashboard-notification
      [notification {:handlers [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {bad-id :id}  {:dataset_query (mt/native-query {:query "SELECT 1/0"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      bad-id}
                       :model/Card          {good-id :id} {:dataset_query (mt/native-query {:query "SELECT 'ok' as msg"})}
                       :model/DashboardCard _              {:dashboard_id dashboard-id
                                                            :card_id      good-id}]
          (testing "dashboard still sends — failing card is silently dropped, good card is included"
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [emails]
                (is (= 1 (count emails))))})))))))

;; ------------------------------------------------------------------------------------------------;;
;;                              Empty dashboard / edge case tests                                  ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest empty-dashboard-no-dashcards-test
  (testing "dashboard with no cards still sends (empty content) when skip_if_empty is false"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty false}
                     :handlers              [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (= 1 (count emails))))})))

  (testing "dashboard with no cards is skipped when skip_if_empty is true"
    (notification.tu/with-dashboard-notification
      [notification {:notification-dashboard {:skip_if_empty true}
                     :handlers              [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (empty? emails)))}))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Multi-tab tests                                              ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest multi-tab-dashboard-test
  (testing "dashboard with multiple tabs renders tab titles in the notification"
    (notification.tu/with-notification-testing-setup!
      (notification.tu/with-dashboard-notification
        [notification {:dashboard {:name dashboard-name}
                       :handlers  [@notification.tu/default-email-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)]
          (mt/with-temp [:model/DashboardTab  {tab1-id :id} {:dashboard_id dashboard-id :name "Tab One" :position 0}
                         :model/DashboardTab  {tab2-id :id} {:dashboard_id dashboard-id :name "Tab Two" :position 1}
                         :model/Card          {card1-id :id} {:dataset_query (mt/native-query {:query "SELECT 'tab1' as msg"})}
                         :model/Card          {card2-id :id} {:dataset_query (mt/native-query {:query "SELECT 'tab2' as msg"})}
                         :model/DashboardCard _               {:dashboard_id dashboard-id
                                                               :card_id      card1-id
                                                               :dashboard_tab_id tab1-id}
                         :model/DashboardCard _               {:dashboard_id dashboard-id
                                                               :card_id      card2-id
                                                               :dashboard_tab_id tab2-id}]
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [[email]]
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name)
                               #"Tab One"
                               #"Tab Two")]
                  (testing "email contains tab titles"
                    (is (true? (get (first (:message summary)) "Tab One")))
                    (is (true? (get (first (:message summary)) "Tab Two"))))))})))))))

(deftest single-tab-dashboard-test
  (testing "dashboard with a single tab does NOT render the tab title"
    (notification.tu/with-notification-testing-setup!
      (notification.tu/with-dashboard-notification
        [notification {:dashboard {:name dashboard-name}
                       :handlers  [@notification.tu/default-email-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)]
          (mt/with-temp [:model/DashboardTab  {tab-id :id}  {:dashboard_id dashboard-id :name "Only Tab" :position 0}
                         :model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT 'data' as msg"})}
                         :model/DashboardCard _              {:dashboard_id dashboard-id
                                                              :card_id      card-id
                                                              :dashboard_tab_id tab-id}]
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [[email]]
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name)
                               #"Only Tab")]
                  (testing "email does NOT contain the single tab title"
                    (is (false? (get (first (:message summary)) "Only Tab"))))))})))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                 card.hide_empty tests                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(deftest card-hide-empty-visualization-setting-test
  (testing "card with card.hide_empty=true is excluded from dashboard when empty"
    (notification.tu/with-notification-testing-setup!
      (notification.tu/with-dashboard-notification
        [notification {:dashboard {:name dashboard-name}
                       :handlers  [@notification.tu/default-email-handler]}]
        (let [dashboard-id (-> notification :payload :dashboard_id)]
          (mt/with-temp [:model/Card          {hidden-id :id}  {:dataset_query (mt/native-query {:query "SELECT NULL"})}
                         :model/DashboardCard _                {:dashboard_id          dashboard-id
                                                                :card_id               hidden-id
                                                                :visualization_settings {:card.hide_empty true}}
                         :model/Card          {visible-id :id} {:dataset_query (mt/native-query {:query "SELECT 'visible' as msg"})}
                         :model/DashboardCard _                {:dashboard_id dashboard-id
                                                                :card_id      visible-id}]
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [[email]]
                (let [summary (mt/summarize-multipart-single-email
                               email
                               (re-pattern dashboard-name)
                               #"visible")]
                  (testing "email still sends (non-hidden card has results)"
                    (is (= dashboard-name (:subject summary))))
                  (testing "email contains the visible card"
                    (is (true? (get (first (:message summary)) "visible"))))))}))))))

  (testing "card with card.hide_empty=false is NOT excluded even when empty"
    (notification.tu/with-dashboard-notification
      [notification {:handlers [@notification.tu/default-email-handler]}]
      (let [dashboard-id (-> notification :payload :dashboard_id)]
        (mt/with-temp [:model/Card          {card-id :id} {:dataset_query (mt/native-query {:query "SELECT NULL"})}
                       :model/DashboardCard _              {:dashboard_id          dashboard-id
                                                            :card_id               card-id
                                                            :visualization_settings {:card.hide_empty false}}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (testing "email still sends even though card result is empty"
                (is (= 1 (count emails)))))}))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                     Audit event tests                                           ;;
;; ------------------------------------------------------------------------------------------------;;

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
