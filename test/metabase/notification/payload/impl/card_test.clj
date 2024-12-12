(ns metabase.notification.payload.impl.card-test
  (:require
   [clojure.test :refer :all]
   [metabase.notification.core :as notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures
 :each
 (fn [thunk]
   (binding [notification/*default-options* {:notification/sync? true}]
     (thunk))))

(defn- rasta-email
  [& [data]]
  (merge {:subject        (format "Alert: %s has results" notification.tu/default-card-name)
          :recipients     #{"rasta@metabase.com"}
          :message-type   :attachments
          :recipient-type nil
          :message        [{notification.tu/default-card-name true}
                           ;; icon
                           notification.tu/png-attachment]}
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
                         :handlers [{:channel_type :channel/email
                                     :recipients   [{:type    :notification-recipient/user
                                                     :user_id (mt/user->id :rasta)}]}
                                    {:channel_type :channel/slack
                                     :recipients   [{:type    :notification-recipient/raw-value
                                                     :details {:value "#general"}}]}
                                    {:channel_type :channel/http
                                     :channel_id   http-channel-id}]}]
          (let [card-id (-> notification :payload :card_id)]
           (notification.tu/test-send-notification!
            notification
            {:channel/email
             (fn [[email]]
               (is (= (rasta-email
                       {:message [{notification.tu/default-card-name true
                                   card-content                     true}
                                  ;; icon
                                  notification.tu/png-attachment]})
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
                                                    ;:question_url  (mt/malli=? [:fn #(str/ends-with? % (str card-id))])
                                                    #_:visualization #_(mt/malli=? [:fn #(str/starts-with? % "data:image/png;base64")])
                                                    :raw_data      {:cols ["MESSAGE"], :rows [["Hello world!!!"]]}}
                               :sent_at            (mt/malli=? :any)}}
                       req)))})))))))
