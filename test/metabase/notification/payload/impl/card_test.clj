(ns metabase.notification.payload.impl.card-test
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
   [metabase.util :as u]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures
  :each
  (fn [thunk]
    (binding [notification.send/*default-options* {:notification/sync? true}]
      (thunk))))

(defn- construct-email
  [& [data]]
  (merge {:subject        (format "Alert: %s has results" notification.tu/default-card-name)
          :recipients     #{"rasta@metabase.com"}
          :message-type   :attachments
          :recipient-type nil
          :message        [{notification.tu/default-card-name true}
                           ;; icon
                           notification.tu/png-attachment
                           notification.tu/csv-attachment]}
         data))

(def card-name-regex (re-pattern notification.tu/default-card-name))

(defn- default-slack-blocks
  [card-id include-image?]
  (cond-> [{:type "header" :text {:type "plain_text" :text "🔔 Card notification test card" :emoji true}}
           {:type "section"
            :text
            {:type "mrkdwn" :text (format "<https://testmb.com/question/%d|Card notification test card>" card-id) :verbatim true}}]
    include-image?
    (conj {:type "image"
           :slack_file {:id (mt/malli=? :string)}
           :alt_text "Card notification test card"})))

(deftest basic-table-notification-test
  (testing "card notification of a simple table"
    (notification.tu/with-notification-testing-setup!
      (let [card-content "Hello world!!!"]
        (mt/with-temp [:model/Channel {http-channel-id :id} {:type    :channel/http
                                                             :details {:url         "https://metabase.com/testhttp"
                                                                       :auth-method "none"}}]
          (notification.tu/with-card-notification
            [notification {:card     {:name notification.tu/default-card-name
                                      :dataset_query (mt/native-query {:query (format "SELECT '%s' as message" card-content)})}
                           :handlers [@notification.tu/default-email-handler
                                      notification.tu/default-slack-handler
                                      {:channel_type :channel/http
                                       :channel_id   http-channel-id}]}]
            (let [card-id (-> notification :payload :card_id)]
              (notification.tu/test-send-notification!
               notification
               {:channel/email
                (fn [[email]]
                  (is (= (construct-email
                          {:message [{notification.tu/default-card-name true
                                      "Manage your subscriptions"       true
                                      card-content                      true}
                                     ;; icon
                                     notification.tu/png-attachment
                                     notification.tu/csv-attachment]})
                         (mt/summarize-multipart-single-email
                          email
                          card-name-regex
                          #"Manage your subscriptions"
                          (re-pattern card-content)))))

                :channel/slack
                (fn [[message]]
                  (is (=? {:blocks
                           (conj (default-slack-blocks card-id false)
                                 {:type "section" :text {:type "plain_text" :text "Hello world!!!"}})
                           :channel "#general"}
                          (notification.tu/slack-message->boolean message))))

                :channel/http
                (fn [[req]]
                  (is (=? {:body {:type               "alert"
                                  :alert_id           (-> notification :payload :id)
                                  :alert_creator_id   (-> notification :creator_id)
                                  :alert_creator_name (t2/select-one-fn :common_name :model/User (:creator_id notification))
                                  :data               {:type          "question"
                                                       :question_id   card-id
                                                       :question_name notification.tu/default-card-name
                                                       :question_url  (mt/malli=? [:fn #(str/ends-with? % (str card-id))])
                                                       :visualization (mt/malli=? [:fn #(str/starts-with? % "data:image/png;base64")])
                                                       :raw_data      {:cols ["MESSAGE"], :rows [["Hello world!!!"]]}}
                                  :sent_at            (mt/malli=? :any)}}
                          req)))}))))))))

(deftest basic-line-graph-test
  (testing "card notification of a simple line graph"
    (notification.tu/with-card-notification
      [notification {:card     {:dataset_query (mt/mbql-query orders {:aggregation [["count"]]
                                                                      :breakout    [!day.created_at]})
                                :display       :line}
                     :handlers [@notification.tu/default-email-handler
                                notification.tu/default-slack-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [[email]]
          (is (= (construct-email
                  {:message [{notification.tu/default-card-name true
                              "Manage your subscriptions"       true}
                             ;; static viz
                             notification.tu/png-attachment
                             ;; icon
                             notification.tu/png-attachment
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"Manage your subscriptions"))))
        :channel/slack
        (fn [[message]]
          (is (=? {:channel "#general"
                   :blocks (default-slack-blocks (-> notification :payload :card_id) true)}
                  (notification.tu/slack-message->boolean message))))}))))

(deftest card-with-rows-saved-to-disk-test
  (testing "whether the rows of a card saved to disk or in memory, all channels should work\n"
    (doseq [limit [1 10]]
      (with-redefs [notification.payload.execute/cells-to-disk-threshold 5]
        (testing (if (> limit @#'notification.payload.execute/cells-to-disk-threshold)
                   "card has rows saved to disk"
                   "card has rows saved in memory")
          (notification.tu/with-notification-testing-setup!
            (mt/with-temp [:model/Channel {http-channel-id :id} {:type    :channel/http
                                                                 :details {:url         "https://metabase.com/testhttp"
                                                                           :auth-method "none"}}]
              (notification.tu/with-card-notification
                [notification {:card     {:name notification.tu/default-card-name
                                          :dataset_query (mt/mbql-query orders {:limit limit})}
                               :handlers [@notification.tu/default-email-handler
                                          notification.tu/default-slack-handler
                                          {:channel_type :channel/http
                                           :channel_id   http-channel-id}]}]
                (notification.tu/test-send-notification!
                 notification
                 {:channel/email
                  (fn [[email]]
                    (is (= (construct-email
                            {:message [{notification.tu/default-card-name true
                                        "Manage your subscriptions"       true}
                                      ;; icon
                                       notification.tu/png-attachment
                                       notification.tu/csv-attachment]})
                           (mt/summarize-multipart-single-email
                            email
                            card-name-regex
                            #"Manage your subscriptions"))))
                  :channel/slack
                  (fn [[message]]
                    (is (=? {:blocks  (default-slack-blocks (-> notification :payload :card_id) true)
                             :channel "#general"}
                            (notification.tu/slack-message->boolean message))))
                  :channel/http
                  (fn [[req]]
                    (is (=? {:body {:type               "alert"
                                    :alert_id           (-> notification :payload :id)
                                    :alert_creator_id   (-> notification :creator_id)
                                    :alert_creator_name (t2/select-one-fn :common_name :model/User (:creator_id notification))
                                    :data               (mt/malli=? :map)
                                    :sent_at            (mt/malli=? :any)}}
                            req)))})))))))))

(deftest cards-with-rows-saved-to-disk-will-cleanup-the-files
  (let [f               (atom nil)
        orig-execute-fn @#'notification.payload.execute/execute-card]
    (with-redefs [notification.payload.execute/cells-to-disk-threshold 1
                  notification.payload.execute/execute-card
                  (fn [& args]
                    (let [result (apply orig-execute-fn args)]
                      (reset! f (-> result :result :data :rows))
                      result))]
      (notification.tu/with-notification-testing-setup!
        (notification.tu/with-card-notification
          [notification {:card     {:name notification.tu/default-card-name
                                    :dataset_query (mt/mbql-query orders {:limit 2})}
                         :handlers [@notification.tu/default-email-handler]}]
          (notification/send-notification! notification)
          (testing "sanity check that the file exists in the first place"
            (is (notification.payload/cleanable? @f)))
          (testing "the files are cleaned up"
            (is (not (.exists ^java.io.File (.file ^metabase.notification.payload.temp_storage.StreamingTempFileStorage @f))))))))))

(deftest ensure-constraints-test
  (testing "Validate card queries are limited by `default-query-constraints`"
    (mt/with-temporary-setting-values [attachment-row-limit 10]
      (notification.tu/with-card-notification [notification {:card     {:dataset_query (mt/mbql-query orders)}
                                                             :handlers [@notification.tu/default-email-handler]}]

        (notification.tu/test-send-notification!
         notification
         {:channel/email
          (fn [[email]]
            ;; this will fail if the query has a limit
            ;; follow up in https://metaboat.slack.com/archives/C064QMXEV9N/p1734522146075659
            (is (= 11
                   (some->> email :message (m/find-first #(= "text/csv" (:content-type %))) :content slurp str/split-lines count))))})))))

(deftest multiple-email-recipients-test
  (notification.tu/with-card-notification
    [notification {:handlers [{:channel_type :channel/email
                               :recipients   [{:type    :notification-recipient/user
                                               :user_id (mt/user->id :crowberto)}
                                              {:type    :notification-recipient/user
                                               :user_id (mt/user->id :rasta)}
                                              {:type    :notification-recipient/raw-value
                                               :details {:value "ngoc@metabase.com"}}]}]}]

    (notification.tu/test-send-notification!
     notification
     {:channel/email
      (fn [emails]
        (is (= #{#{"ngoc@metabase.com"} #{"crowberto@metabase.com" "rasta@metabase.com"}}
               (->> emails
                    (map (comp set :recipients))
                    set))))})))

(deftest send-condition-has-result-test
  (testing "no result should skip sending"
    (doseq [has-result [true false]]
      (testing (format "has-result = %s" has-result)
        (notification.tu/with-card-notification
          [notification {:card              {:dataset_query (mt/native-query {:query (if has-result "SELECT 1 as data" "SELECT NULL")})}
                         :notification-card {:send_condition :has_result}
                         :handlers          [@notification.tu/default-email-handler
                                             notification.tu/default-slack-handler]}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (if has-result
                (is (= 1 (count emails)))
                (is (= 0 (count emails)))))
            :channel/slack
            (fn [messages]
              (if has-result
                (is (= 1 (count messages)))
                (is (= 0 (count messages)))))}))))))

(defn- progress-result [val]
  {:card   {:display                :progress
            :visualization_settings {:progress.goal    5}}
   :result {:data {:rows [[val]]}}})

(defn- timeseries-result [val]
  {:card   {:display                :bar
            :visualization_settings {:graph.goal_value 5}}
   :result {:data {:cols [{:source :breakout}
                          {:name           "avg"
                           :source         :aggregation
                           :base_type      :type/Integer
                           :effective-type :type/Integer
                           :semantic_type  :type/Quantity}]
                   :rows [["2021-01-01T00:00:00Z" val]]}}})

(deftest ^:parallel goal-met-progress-bar-alert-above-test
  (testing "Progress bar with alert above"
    (let [alert-above-pulse {:send_condition "goal_above"}
          goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
      (testing "value below goal"  (is (= false  (goal-met? alert-above-pulse (progress-result 4)))))
      (testing "value equals goal" (is (true?    (goal-met? alert-above-pulse (progress-result 5)))))
      (testing "value above goal"  (is (true?    (goal-met? alert-above-pulse (progress-result 6))))))))

(deftest ^:parallel goal-met-progress-bar-alert-below-test
  (testing "Progress bar with alert below"
    (let [alert-below-pulse {:send_condition "goal_below"}
          goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
      (testing "value below goal"  (is (true?    (goal-met? alert-below-pulse (progress-result 4)))))
      (testing "value equals goal (#10899)" (is (= false  (goal-met? alert-below-pulse (progress-result 5)))))
      (testing "value above goal"  (is (= false  (goal-met? alert-below-pulse (progress-result 6))))))))

(deftest ^:parallel goal-met-timeseries-alert-above-test
  (testing "Timeseries with alert above"
    (let [alert-above-pulse {:send_condition "goal_above"}
          goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
      (testing "value below goal"  (is (= false  (goal-met? alert-above-pulse (timeseries-result 4)))))
      (testing "value equals goal" (is (true?    (goal-met? alert-above-pulse (timeseries-result 5)))))
      (testing "value above goal"  (is (true?    (goal-met? alert-above-pulse (timeseries-result 6))))))))

(deftest ^:parallel goal-met-timeseries-alert-below-test
  (testing "Timeseries with alert below"
    (let [alert-below-pulse {:send_condition "goal_below"}
          goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
      (testing "value below goal"  (is (true?    (goal-met? alert-below-pulse (timeseries-result 4)))))
      (testing "value equals goal" (is (= false  (goal-met? alert-below-pulse (timeseries-result 5)))))
      (testing "value above goal"  (is (= false  (goal-met? alert-below-pulse (timeseries-result 6))))))))

(deftest send-condition-above-goal-test
  (testing "skip is the goal is not met"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query          (mt/mbql-query
                                                                   checkins
                                                                   {:aggregation [["count"]]
                                                                    :filter      [:between $date "2014-04-01" "2014-06-01"]
                                                                    :breakout    [!day.date]})
                                         :display                :line
                                         :visualization_settings {:graph.show_goal  true
                                                                  :graph.goal_value 1000
                                                                  :graph.dimensions ["DATE"]
                                                                  :graph.metrics    ["count"]}}
                     :notification-card {:send_condition :goal_above}
                     :handlers          [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (empty? emails)))})))

  (testing "send if goal is met"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query          (mt/mbql-query
                                                                   checkins
                                                                   {:aggregation [["count"]]
                                                                    :filter      [:between $date "2014-04-01" "2014-06-01"]
                                                                    :breakout    [!day.date]})
                                         :display                :line
                                         :visualization_settings {:graph.show_goal  true
                                                                  :graph.goal_value 5.9
                                                                  :graph.dimensions ["DATE"]
                                                                  :graph.metrics    ["count"]}}
                     :notification-card {:send_condition :goal_above}
                     :handlers          [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [[email]]
          (is (= (construct-email
                  {:subject "Alert: Card notification test card has reached its goal"
                   :message [{notification.tu/default-card-name true
                              "This question has reached its goal of 5\\.9\\." true}
                             notification.tu/png-attachment
                             notification.tu/png-attachment
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"This question has reached its goal of 5\.9\."))))}))))

(deftest send-condition-below-goal-test
  (testing "skip is the goal is not met"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query          (mt/mbql-query
                                                                   checkins
                                                                   {:aggregation [["count"]]
                                                                    :filter      [:between $date "2014-04-01" "2014-06-01"]
                                                                    :breakout    [!day.date]})
                                         :display                :line
                                         :visualization_settings {:graph.show_goal  true
                                                                  :graph.goal_value 0
                                                                  :graph.dimensions ["DATE"]
                                                                  :graph.metrics    ["count"]}}
                     :notification-card {:send_condition :goal_below}
                     :handlers          [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (empty? emails)))})))

  (testing "send if goal is met"
    (notification.tu/with-card-notification
      [notification {:card              {:dataset_query          (mt/mbql-query
                                                                   checkins
                                                                   {:aggregation [["count"]]
                                                                    :filter      [:between $date "2014-04-01" "2014-06-01"]
                                                                    :breakout    [!day.date]})
                                         :display                :line
                                         :visualization_settings {:graph.show_goal  true
                                                                  :graph.goal_value 1.1
                                                                  :graph.dimensions ["DATE"]
                                                                  :graph.metrics    ["count"]}}
                     :notification-card {:send_condition :goal_below}
                     :handlers          [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [[email]]
          (is (= (construct-email
                  {:subject "Alert: Card notification test card has gone below its goal"
                   :message [{notification.tu/default-card-name true
                              "This question has gone below its goal of 1\\.1\\." true}
                             notification.tu/png-attachment
                             notification.tu/png-attachment
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"This question has gone below its goal of 1\.1\."))))}))))

(deftest send-once-archive-on-first-successful-send
  (notification.tu/with-card-notification
    [notification {:notification-card {:send_once true}}]
    (let [notification (t2/select-one :model/Notification (:id notification))]
      (testing "do not archive if the send fail for any reason"
        (mt/with-dynamic-fn-redefs [notification.payload/notification-payload (fn [& _args] (throw (ex-info "error" {})))]
          (u/ignore-exceptions (notification/send-notification! notification))
          (is (true? (t2/select-one-fn :active :model/Notification (:id notification))))))

      (testing "archive if the send is successful"
        (notification/send-notification! notification)
        (is (false? (t2/select-one-fn :active :model/Notification (:id notification))))
        (testing "once archived, notifications will be skipped if trying to send"
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (empty? emails)))}))))))

(deftest send-once-with-goal-test
  (notification.tu/with-card-notification
    [notification {:card              {:dataset_query          (mt/mbql-query
                                                                 checkins
                                                                 {:aggregation [["count"]]
                                                                  :filter      [:between $date "2014-04-01" "2014-06-01"]
                                                                  :breakout    [!day.date]})
                                       :display                :line
                                       :visualization_settings {:graph.show_goal  true
                                                                :graph.goal_value 0
                                                                :graph.dimensions ["DATE"]
                                                                :graph.metrics    ["count"]}}
                   :notification-card {:send_condition :goal_below
                                       :send_once      true}
                   :handlers          [@notification.tu/default-email-handler]}]
    (testing "if the goal is not met, no email is sent and notification is active"
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (zero? (count emails)))
          (is (true? (t2/select-one-fn :active :model/Notification (:id notification)))))}))

    (testing "if the goal is met, notification is sent then archived"
      ;; flip the condition so the goal is met now
      (t2/update! :model/NotificationCard (get-in notification [:payload :id]) {:send_condition :goal_above})
      (notification.tu/test-send-notification!
       (t2/select-one :model/Notification (:id notification))
       {:channel/email
        (fn [emails]
          (is (= 1 (count emails)))
          (is (false? (t2/select-one-fn :active :model/Notification (:id notification)))))}))))

(deftest non-user-email-test
  (notification.tu/with-card-notification
    [notification {:handlers [{:channel_type :channel/email
                               :recipients   [{:type    :notification-recipient/raw-value
                                               :details {:value "ngoc@metabase.com"}}]}]}]
    (notification.tu/test-send-notification!
     notification
     {:channel/email
      (fn [[email]]
        (testing "email is sent correctly"
          (is (= (construct-email
                  {:recipients #{"ngoc@metabase.com"}
                   :message [{notification.tu/default-card-name true
                              "Manage your subscriptions"       false
                              "Unsubscribe"                     true}
                             notification.tu/png-attachment
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"Manage your subscriptions"
                  #"Unsubscribe"))))

        (testing "the unsubscribe url is correct"
          (let [url    (re-find #"https://[^/]+/unsubscribe[^\"]*" (-> email :message first :content))
                params (codec/form-decode (second (str/split url #"\?")))]
            (is (int? (parse-long (get params "notification-handler-id"))))
            (is (= "ngoc@metabase.com" (get params "email")))
            (is (string? (get params "hash"))))))})))

(deftest permission-test
  (mt/with-temp [:model/Collection coll {}]
    (letfn [(payload! [user-kw]
              (notification.tu/with-card-notification
                [notification {:card {:collection_id (:id coll)}
                               :notification {:creator_id (mt/user->id user-kw)}}]
                (perms/revoke-collection-permissions! (perms/all-users-group) coll)
                (get-in (notification/notification-payload notification)
                        [:payload :card_part :result])))]
      (testing "rasta has no permissions and will get error"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"You don't have permissions"
             (payload! :rasta))))
      (testing "crowberto can see the card"
        (is (pos-int? (:row_count (payload! :crowberto))))))))

;; TODO this should be a test for metabase.notification.send because it's generic for all notification types
(deftest partial-channel-failure-will-deliver-all-that-success-test
  (testing "if a pulse is set to send to multiple channels and one of them fail, the other channels should still receive the message"
    (notification.tu/with-send-notification-sync
      (notification.tu/with-card-notification
        [notification {:handlers [@notification.tu/default-email-handler
                                  notification.tu/default-slack-handler]}]

        (let [original-render-noti (var-get #'channel/render-notification)]
          (with-redefs [channel/render-notification (fn [& args]
                                                      (if (= :channel/slack (first args))
                                                        (throw (ex-info "Slack failed" {}))
                                                        (apply original-render-noti args)))]
            ;; slack failed but email should still be sent
            (notification.tu/test-send-notification!
             notification
             {:channel/email
              (fn [emails]
                (is (pos-int? (count emails))))
              :channel/slack
              (fn [messages]
                (is (nil?  messages)))})))))))

(deftest skip-for-archived-cards-test
  (testing "should not send for archived cards"
    (notification.tu/with-card-notification
      [notification {:card     {:archived true}
                     :handlers [@notification.tu/default-email-handler]}]
      (notification.tu/test-send-notification!
       notification
       {:channel/email
        (fn [emails]
          (is (empty? emails)))}))))

(deftest notification-with-invalid-card-should-fail-test
  (testing "If the card is failed to execute, the notification should fail (#54495)"
    (notification.tu/with-card-notification
      [notification {:card     {:dataset_query (mt/native-query {:query "select 1/0"})}
                     :handlers [@notification.tu/default-email-handler]}]
      (t2/delete! :model/TaskHistory)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Failed to execute card with error: Division by zero: " 1 ""
           (#'notification.send/send-notification-sync! notification)))
      (is (=? [{:status :failed
                :task_details {:message (mt/malli=? [:fn #(str/includes? % "Division by zero")])}}]
              (t2/select [:model/TaskHistory :status :task_details] :task "notification-send"
                         {:order-by [[:started_at :asc]]}))))))

(defn- email->attachment-line-count
  [email]
  (let [attachment (m/find-first #(= "text/csv" (:content-type %)) (:message email))]
    (if attachment
      (with-open [rdr (io/reader (:content attachment))]
        (count (line-seq rdr)))
      nil)))

(deftest card-attachment-limit-test
  (testing "#55522"
    (testing "by default card attachment returns all rows"
      (notification.tu/with-card-notification
        [notification {:card     {:dataset_query (mt/mbql-query orders)}
                       :handlers [@notification.tu/default-email-handler]}]
        (notification.tu/test-send-notification!
         notification
         {:channel/email
          (fn [emails]
            (is (= 18761 (email->attachment-line-count (first emails)))))})))

    (testing "respect attachment limit env if set"
      (mt/with-temporary-setting-values [attachment-row-limit 10]
        (notification.tu/with-card-notification
          [notification {:card     {:dataset_query (mt/mbql-query orders)}
                         :handlers [@notification.tu/default-email-handler]}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 11 (email->attachment-line-count (first emails)))))}))))

    (testing "respect query limit if set"
      (notification.tu/with-card-notification
        [notification {:card     {:dataset_query (mt/mbql-query orders {:limit 10})}
                       :handlers [@notification.tu/default-email-handler]}]
        (notification.tu/test-send-notification!
         notification
         {:channel/email
          (fn [emails]
            (is (= 11 (email->attachment-line-count (first emails)))))})))

    (testing "attachment limit env > query limit"
      (mt/with-temporary-setting-values [attachment-row-limit 10]
        (notification.tu/with-card-notification
          [notification {:card     {:dataset_query (mt/mbql-query orders {:limit 20})}
                         :handlers [@notification.tu/default-email-handler]}]
          (notification.tu/test-send-notification!
           notification
           {:channel/email
            (fn [emails]
              (is (= 11 (email->attachment-line-count (first emails)))))}))))))

(deftest audit-alert-send-event-test
  (testing "When we send an alert, we also log the event:"
    (mt/when-ee-evailable
     (mt/with-premium-features #{:audit-app}
       (notification.tu/with-card-notification [notification {:handlers [{:channel_type :channel/email,
                                                                          :recipients [{:type :notification-recipient/user
                                                                                        :user_id (mt/user->id :rasta)}
                                                                                       {:type :notification-recipient/raw-value
                                                                                        :details {:value "ngoc@metabase.com"}}]}]}]
         (notification/send-notification! notification :notification/sync? true)
         (is (=? {:topic    :alert-send
                  :user_id  (mt/user->id :crowberto)
                  :model    "Pulse"
                  :model_id (:id notification)
                  :details  {:recipients [{:id (mt/user->id :rasta)}
                                          "ngoc@metabase.com"]
                             :filters    nil}}
                 (mt/latest-audit-log-entry :alert-send (:id notification)))))))))

(deftest ^:parallel progress-value-column-test
  (testing "Progress charts should use progress.value column instead of first column"
    (let [goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)
          notification-card {:send_condition "goal_above"}
          card-part {:card {:display :progress
                            :visualization_settings {:progress.value "actual_value"
                                                     :progress.goal "Target"}}
                     :result {:data {:cols [{:name "ignore_me" :base_type :type/Integer}
                                            {:name "actual_value" :base_type :type/Integer}
                                            {:name "Target" :base_type :type/Integer}]
                                     :rows [[999 120 100]]}}}]
      (is (true? (goal-met? notification-card card-part))
          "Should return true when actual_value (120) >= Target (100)"))))

(deftest ^:parallel progress-value-fallback-test
  (testing "Progress charts should fall back to first numeric column when no progress.value is set"
    (let [goal-met? (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)
          notification-card {:send_condition "goal_above"}
          card-part {:card {:display :progress
                            :visualization_settings {:progress.goal "Target"}}
                     :result {:data {:cols [{:name "text_col" :base_type :type/Text}
                                            {:name "numeric_col" :base_type :type/Integer}
                                            {:name "Target" :base_type :type/Integer}]
                                     :rows [["text" 120 100]]}}}]
      (is (true? (goal-met? notification-card card-part))
          "Should return true when first numeric column (120) >= Target (100)"))))
