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
  [event request-fn channel-type->assert-fns]
  (data-editing.tu/with-temp-test-db!
    (mt/with-temp [:model/Channel chn {:type :channel/http}]
      (notification.tu/with-system-event-notification!
        [_notification {:notification-system-event {:event_name event
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
   :event/rows.created
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
                                                :text "*Crowberto Corv has created a row for CATEGORIES*\n*Created row:*\n• ID : 76\n• NAME : New Category"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a new row"
                              :body    [{"Crowberto Corv has created a row for CATEGORIES" true
                                         "NAME: New Category" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has created a row for CATEGORIES"
                              #"NAME: New Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest update-row-notification-test
  (test-row-notification!
   :event/rows.updated
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
                                                :text "*Crowberto Corv has updated a row from CATEGORIES*\n*Update:*\n• name : Updated Category"}}]}]
                              :channel-id  "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has been updated"
                              :body [{"Crowberto Corv has updated a row in CATEGORIES" true
                                      "name: Updated Category"                         true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has updated a row in CATEGORIES"
                              #"name: Updated Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest delete-row-notification-test
  (test-row-notification!
   :event/rows.deleted
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
                                                :text "*Crowberto Corv has deleted a row from CATEGORIES*\n*Deleted row:*\n• id : 1\n• name : African"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a row deleted"
                              :body    [{"Crowberto Corv has deleted a row from CATEGORIES" true
                                         "name: African" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has deleted a row from CATEGORIES"
                              #"name: African"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest create-row-notification-webhook-test
  (test-row-notification!
   :event/rows.created
   (fn []
     (let [token  (:token (mt/user-http-request :crowberto
                                                :post "ee/data-editing/webhook"
                                                {:table-id (mt/id :categories)}))]
       (mt/user-http-request
        :crowberto
        :post
        (data-editing.tu/webhook-ingest-url token)
        [{:NAME "New Category"}])))

   {:channel/slack (fn [[message :as msgs]]
                     (is (= 1 (count msgs)))
                     (is (=? {:attachments [{:blocks
                                             [{:type "section",
                                               :text
                                               {:type "mrkdwn",
                                                :text "*Crowberto Corv has created a row for CATEGORIES*\n*Created row:*\n• ID : 76\n• NAME : New Category"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a new row"
                              :body    [{"Crowberto Corv has created a row for CATEGORIES" true
                                         "NAME: New Category" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has created a row for CATEGORIES"
                              #"NAME: New Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest filter-notifications-test
  (testing "getting table notifications will return only notifications of a table and action"
    (doseq [event [:event/rows.created
                   :event/rows.updated
                   :event/rows.deleted]]
      (notification.tu/with-system-event-notification!
        [_create-categories {:notification-system-event {:event_name event
                                                         :table_id   (mt/id :categories)}}]

        (notification.tu/with-system-event-notification!
          [create-orders {:notification-system-event {:event_name event
                                                      :table_id   (mt/id :orders)}}]
          (is (= [(:id create-orders)]
                 (map :id (#'events.notification/notifications-for-topic
                           event
                           {:args {:table_id (mt/id :orders)}})))))))))

(deftest example-payload-row-create-test
  (is (=? {:creator  {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor   {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table    {:id 1 :name "orders"}
           :records  [{:row {:ID 1 :STATUS "approved"} :changes {:STATUS {:before "pending" :after "approved"}}}]
           :settings {}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/rows.created}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest example-payload-row-update-test
  (is (=? {:creator  {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor   {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table    {:id 1 :name "orders"}
           :records  [{:row {:ID 1 :STATUS "approved"} :changes {:STATUS {:before "pending" :after "approved"}}}]
           :settings {}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/rows.updated}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest example-payload-row-delete-test
  (is (=? {:creator  {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor   {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table    {:id 1 :name "orders"}
           :records  [{:row {:ID 1 :STATUS "approved"} :changes {:STATUS {:before "pending" :after "approved"}}}]
           :settings {}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/rows.deleted}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest preview-notification-test
  (is (=? {:context  (mt/malli=? :map)
           :rendered {:from    "notifications@metabase.com"
                      :bcc     ["bot@metabase.com"]
                      :subject "Meta Bot has created a row for orders"
                      :body    [{:type "text/html; charset=utf-8" :content "Created 1 records"}]}}
          (mt/user-http-request :crowberto :post 200 "notification/preview_template"
                                {:template     {:channel_type :channel/email
                                                :details {:type    :email/handlebars-text
                                                          :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                          :body    "Created {{count records}} records"}}
                                 :notification {:payload_type :notification/system-event
                                                :payload      {:event_name :event/rows.created}}}))))

(deftest preview-notification-custom-payload-test
  (testing "use the custom context if it's valid"
    (is (=? {:context  (mt/malli=? :map)
             :rendered {:from    "notifications@metabase.com"
                        :bcc     ["bot@metabase.com"]
                        :subject "Ngoc Khuat has created a row for orders"
                        :body    [{:type "text/html; charset=utf-8" :content "Created 1 records"}]}}
            (mt/user-http-request :crowberto :post 200 "notification/preview_template"
                                  {:template     {:channel_type :channel/email
                                                  :details {:type    :email/handlebars-text
                                                            :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                            :body    "Created {{count records}} records"}}
                                   :notification   {:payload_type :notification/system-event
                                                    :payload      {:event_name :event/rows.created}}
                                   :custom_context {:context {}
                                                    :creator {:common_name "Meta Bot",
                                                              :email "bot@metabase.com",
                                                              :first_name "Meta",
                                                              :last_name "Bot"},
                                                    :editor {:common_name "Ngoc Khuat",
                                                             :email "ngoc@metabase.com",
                                                             :first_name "Ngoc",
                                                             :last_name "Khuat"},
                                                    :payload_type "notification/system-event",
                                                    :records [{:changes {:STATUS {:after "approved", :before "pending"}},
                                                               :row {:ID 1, :STATUS "approved"}}],
                                                    :settings {},
                                                    :table {:id 1, :name "orders"}}}))))
  (testing "fail if the custom context does not match the schema"
    (is (=? {:message "Value does not match schema"
             :data    {:error (mt/malli=? :map)}}
            (mt/user-http-request :crowberto :post 500 "notification/preview_template"
                                  {:template     {:channel_type :channel/email
                                                  :details {:type    :email/handlebars-text
                                                            :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                            :body    "Created {{count records}} records"}}
                                   :notification   {:payload_type :notification/system-event
                                                    :payload      {:event_name :event/rows.created}}
                                   :custom_context {::context true}})))))
