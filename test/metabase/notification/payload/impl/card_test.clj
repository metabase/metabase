(ns metabase.notification.payload.impl.card-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures
  :each
  (fn [thunk]
    (binding [notification/*default-options* {:notification/sync? true}]
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

(deftest basic-card-notification-test
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
                                    card-content                     true}
                                  ;; icon
                                   notification.tu/png-attachment
                                   notification.tu/csv-attachment]})
                       (mt/summarize-multipart-single-email
                        email
                        card-name-regex
                        (re-pattern card-content)))))

              :channel/slack
              (fn [[message]]
                (is (=? {:attachments [{:blocks [{:text {:emoji true
                                                         :text "🔔 Card notification test card"
                                                         :type "plain_text"}
                                                  :type "header"}]}
                                       {:attachment-name "image.png"
                                        :channel-id "FOO"
                                        :fallback "Card notification test card",
                                        :rendered-info {:attachments false
                                                        :content true
                                                        :render/text true}
                                        :title "Card notification test card"}]
                         :channel-id "#general"}
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
                        req)))})))))))

(deftest ensure-constraints-test
  (testing "Validate card queries are limited by `default-query-constraints`"
    (mt/with-temporary-setting-values [public-settings/download-row-limit 10]
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
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"This question has reached its goal of 5\.9\."))))}))))

(deftest ^:parallel goal-met-test
  (let [alert-above-pulse {:send_condition "goal_above"}
        alert-below-pulse {:send_condition "goal_below"}
        progress-result   (fn [val] {:card   {:display                :progress
                                              :visualization_settings {:progress.goal    5}}
                                     :result {:data {:rows [[val]]}}})
        timeseries-result (fn [val] {:card   {:display                :bar
                                              :visualization_settings {:graph.goal_value 5}}
                                     :result {:data {:cols [{:source :breakout}
                                                            {:name           "avg"
                                                             :source         :aggregation
                                                             :base_type      :type/Integer
                                                             :effective-type :type/Integer
                                                             :semantic_type  :type/Quantity}]
                                                     :rows [["2021-01-01T00:00:00Z" val]]}}})
        goal-met?           (requiring-resolve 'metabase.notification.payload.impl.card/goal-met?)]
    (testing "Progress bar"
      (testing "alert above"
        (testing "value below goal"  (is (= false (goal-met? alert-above-pulse (progress-result 4)))))
        (testing "value equals goal" (is (=  true (goal-met? alert-above-pulse (progress-result 5)))))
        (testing "value above goal"  (is (=  true (goal-met? alert-above-pulse (progress-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (=  true (goal-met? alert-below-pulse (progress-result 4)))))
        (testing "value equals goal (#10899)" (is (= false (goal-met? alert-below-pulse (progress-result 5)))))
        (testing "value above goal"  (is (= false (goal-met? alert-below-pulse (progress-result 6)))))))
    (testing "Timeseries"
      (testing "alert above"
        (testing "value below goal"  (is (= false (goal-met? alert-above-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (=  true (goal-met? alert-above-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (=  true (goal-met? alert-above-pulse (timeseries-result 6))))))
      (testing "alert below"
        (testing "value below goal"  (is (=  true (goal-met? alert-below-pulse (timeseries-result 4)))))
        (testing "value equals goal" (is (= false (goal-met? alert-below-pulse (timeseries-result 5)))))
        (testing "value above goal"  (is (= false (goal-met? alert-below-pulse (timeseries-result 6)))))))))

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
                             notification.tu/csv-attachment]})
                 (mt/summarize-multipart-single-email
                  email
                  card-name-regex
                  #"This question has gone below its goal of 1\.1\."))))}))))

(deftest non-user-email-test
  (notification.tu/with-card-notification
    [notification {:handlers [{:channel_type :channel/email
                               :recipients   [{:type    :notification-recipient/raw-value
                                               :details {:value "ngoc@metabase.com"}}]}]}]
    (notification.tu/test-send-notification!
     notification
     {:channel/email
      (fn [[emails]]
        (is (= (construct-email
                {:recipients #{"ngoc@metabase.com"}
                 :message [{notification.tu/default-card-name true
                            "Manage your subscriptions" true
                            "Unsubscribe" true}
                           notification.tu/png-attachment
                           notification.tu/csv-attachment]})
               (mt/summarize-multipart-single-email
                (first emails)
                card-name-regex
                #"Manage your subscriptions"
                #"Unsubscribe"))))})))

(deftest permission-test
  (testing "question is executed using notification's creator permissions"))
