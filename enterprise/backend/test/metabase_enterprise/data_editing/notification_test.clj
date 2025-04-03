(ns metabase-enterprise.data-editing.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.events.notification :as events.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]))

(use-fixtures :each (fn [thunk]
                      (mt/with-premium-features #{:table-data-editing}
                        (thunk))))

(defn all-handlers
  [http-channel-id]
  [{:channel_type :channel/email
    :recipients [{:type :notification-recipient/user
                  :user_id (mt/user->id :crowberto)}]}
   {:channel_type :channel/slack
    :recipients [{:type :notification-recipient/raw-value
                  :details {:value "#test-pulse"}}]}
   {:channel_type :channel/http
    :channel_id   http-channel-id}])

(defn test-row-notification!
  [action request-fn channel-type->assert-fns]
  (data-editing.tu/with-temp-test-db!
    (mt/with-temp [:model/Channel chn {:type :channel/http}]
      (notification.tu/with-system-event-notification!
        [_notification {:notification-system-event {:event_name :event/action.success
                                                    :action     action
                                                    :table_id   (mt/id :categories)}
                        :handlers                  (all-handlers (:id chn))}]
        (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
          (let [channel-type->captured-message (notification.tu/with-captured-channel-send!
                                                 (request-fn))]
            (doseq [[channel-type assert-fn] channel-type->assert-fns]
              (testing (format "channel-type = %s" channel-type)
                (assert-fn (get channel-type->captured-message channel-type))))))))))

(deftest create-row-notification-test
  (test-row-notification!
   :row/create
   (fn []
     (mt/user-http-request
      :crowberto
      :post
      (data-editing.tu/table-url (mt/id :categories))
      {:rows [{:NAME "New Category"}]}))

   {:channel/slack (fn [[message :as msgs]]
                     (is (= 1 (count msgs)))
                     (is (=? {:attachments [{:blocks
                                             [{:type "section",
                                               :text
                                               {:type "mrkdwn",
                                                :text "*Crowberto Corv has created a row for CATEGORIES*\n• ID : 76\n• NAME : New Category"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a new row"
                              :message [{"Crowberto Corv has created a row for CATEGORIES" true
                                         "NAME: New Category" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has created a row for CATEGORIES"
                              #"NAME: New Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body {:type "system_event",
                                     :payload {:action :row/create,
                                               :invocation_id (mt/malli=? :string)
                                               :actor_id 3,
                                               :result    {:table_id (mt/id :categories)
                                                           :created_row {"ID" (mt/malli=? int?), "NAME" "New Category"}
                                                           :table {:name "CATEGORIES"}}
                                               :actor     {:first_name "Crowberto"
                                                           :last_name "Corv"
                                                           :email "crowberto@metabase.com"
                                                           :common_name "Crowberto Corv"}
                                               :event_name :event/action.success
                                               :custom {}}}}
                             req)))}))

(deftest update-row-notification-test
  (test-row-notification!
   :row/update
   (fn []
     (mt/user-http-request
      :crowberto
      :put
      (data-editing.tu/table-url (mt/id :categories))
      {:rows [{:ID 1 :NAME "Updated Category"}]}))

   {:channel/slack (fn [[message :as msgs]]
                     (is (= 1 (count msgs)))
                     (is (=? {:attachments [{:blocks
                                             [{:type "section",
                                               :text
                                               {:type "mrkdwn",
                                                :text "*Crowberto Corv has updated a from CATEGORIES*\n*Update:*\n• ID : 1\n• NAME : Updated Category"}}]}]
                              :channel-id  "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has been updated"
                              :message [{"Crowberto Corv has updated a row in CATEGORIES" true
                                         "NAME: Updated Category"                         true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has updated a row in CATEGORIES"
                              #"NAME: Updated Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body {:event_info {:action :row/update,
                                                  :invocation_id (mt/malli=? :string)
                                                  :actor_id (mt/user->id :crowberto)
                                                  :result {:table_id (mt/id :categories)
                                                           :after {:ID 1, :NAME "Updated Category"}
                                                           :before {:ID 1, :NAME "African"}
                                                           :raw_update {:ID 1, :NAME "Updated Category"}
                                                           :table {:name "CATEGORIES"}}
                                                  :actor {:first_name  "Crowberto"
                                                          :last_name   "Corv"
                                                          :email       "crowberto@metabase.com"
                                                          :common_name "Crowberto Corv"}}
                                     :event_name :event/action.success
                                     :type "system_event"}}
                             req)))}))

(deftest delete-row-notification-test
  (test-row-notification!
   :row/delete
   (fn []
     (mt/user-http-request
      :crowberto
      :post
      (format "%s/delete" (data-editing.tu/table-url (mt/id :categories)))
      {:rows [{:ID 1}]}))

   {:channel/slack (fn [[message :as msgs]]
                     (is (= 1 (count msgs)))
                     (is (=? {:attachments [{:blocks
                                             [{:type "section",
                                               :text
                                               {:type "mrkdwn",
                                                :text "*Crowberto Corv has deleted a from CATEGORIES*\n• ID : 1\n• NAME : African"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a row deleted"
                              :message [{"Crowberto Corv has deleted a row from CATEGORIES" true
                                         "NAME: African" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has deleted a row from CATEGORIES"
                              #"NAME: African"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body {:event_info {:action        :row/delete
                                                  :invocation_id (mt/malli=? :string)
                                                  :actor_id      (mt/user->id :crowberto)
                                                  :result        {:table_id    (mt/id :categories)
                                                                  :deleted_row {:ID 1 :NAME "African"}
                                                                  :table {:name "CATEGORIES"}}
                                                  :actor         {:first_name  "Crowberto"
                                                                  :last_name   "Corv"
                                                                  :email       "crowberto@metabase.com"
                                                                  :common_name "Crowberto Corv"}}
                                     :event_name :event/action.success
                                     :type "system_event"}}
                             req)))}))

(deftest filter-notifications-test
  (testing "getting table notifications will return only notifications of a table and action"
    (doseq [action [:row/create
                    :row/update
                    :row/delete]]
      (notification.tu/with-system-event-notification!
        [_create-categories {:notification-system-event {:event_name :event/action.success
                                                         :action     action
                                                         :table_id   (mt/id :categories)}}]

        (notification.tu/with-system-event-notification!
          [create-orders {:notification-system-event {:event_name :event/action.success
                                                      :action     action
                                                      :table_id   (mt/id :orders)}}]
          (is (= [(:id create-orders)]
                 (map :id (#'events.notification/notifications-for-topic
                           :event/action.success
                           {:action action
                            :result {:table_id (mt/id :orders)}})))))))))
