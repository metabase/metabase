(ns metabase-enterprise.data-editing.notification-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-editing.test-util :as data-editing.tu]
   [metabase.actions.test-util :as actions.tu]
   [metabase.events.notification :as events.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
  [prop request-fn channel-type->assert-fns]
  (data-editing.tu/with-temp-test-db!
    (mt/with-temp [:model/Channel chn {:type :channel/http}]
      (notification.tu/with-system-event-notification!
        [notification {:notification-system-event {:event_name (:event_name prop)
                                                   :table_id   (mt/id (or (:table prop) :categories))}
                       :handlers                  (all-handlers (:id chn))}]
        (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
          (let [channel-type->captured-message (notification.tu/with-captured-channel-send!
                                                 (request-fn notification))]
            (doseq [[channel-type assert-fn] channel-type->assert-fns]
              (testing (format "channel-type = %s" channel-type)
                (assert-fn (get channel-type->captured-message channel-type))))))))))

(deftest create-row-notification-test
  (test-row-notification!
   {:event_name :event/row.created}
   (fn [_notification]
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
   {:event_name :event/row.updated}
   (fn [_notification]
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
                                                :text "*Crowberto Corv has updated a row from CATEGORIES*\n*Update:*\n• ID : 1\n• NAME : Updated Category"}}]}]
                              :channel-id  "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has been updated"
                              :body [{"Crowberto Corv has updated a row in CATEGORIES" true
                                      "NAME: Updated Category"                         true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has updated a row in CATEGORIES"
                              #"NAME: Updated Category"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest delete-row-notification-test
  (test-row-notification!
   {:event_name :event/row.deleted}
   (fn [_notification]
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
                                                :text "*Crowberto Corv has deleted a row from CATEGORIES*\n*Deleted row:*\n• ID : 1\n• NAME : African"}}]}]
                              :channel-id "#test-pulse"}
                             message)))
    :channel/email (fn [[email :as emails]]
                     (is (= 1 (count emails)))
                     (is (=? {:subject "Table CATEGORIES has a row deleted"
                              :body    [{"Crowberto Corv has deleted a row from CATEGORIES" true
                                         "NAME: African" true}]}
                             (mt/summarize-multipart-single-email
                              email
                              #"Crowberto Corv has deleted a row from CATEGORIES"
                              #"NAME: African"))))
    :channel/http  (fn [[req :as reqs]]
                     (is (= 1 (count reqs)))
                     (is (=? {:body (mt/malli=? :map)} req)))}))

(deftest record-and-changes-in-template-context-are-ordered
  (actions.tu/with-actions-test-data-tables #{"people"}
    (test-row-notification!
     {:event_name :event/row.updated
      :table      :people}
     (fn [notification]
       (mt/with-temp [:model/ChannelTemplate {tmpl-id :id} {:name "My Custom template"
                                                            :channel_type :channel/email
                                                            :details {:type :email/handlebars-text
                                                                      :subject "Hello"
                                                                      :body (str "Row: {{#each record}}{{@key}},{{/each}}\n"
                                                                                 "Changes: {{#each changes}}{{@key}},{{/each}}")}}]
         (t2/update! :model/NotificationHandler (->> notification :handlers first :id) {:template_id tmpl-id})
         (mt/user-http-request
          :crowberto
          :put
          (data-editing.tu/table-url (mt/id :people))
          {:rows [{:ID 1 :NAME "Ngoc Khuat" :CITY "Ha Noi" :EMAIL "ngoc@metabase.com"}]})))
     {:channel/email (fn [[email :as _emails]]
                       (is (=? {:body    [{:content (str "Row: ID,ADDRESS,EMAIL,PASSWORD,NAME,CITY,LONGITUDE,STATE,SOURCE,BIRTH_DATE,ZIP,LATITUDE,CREATED_AT,\n"
                                                         "Changes: ID,ADDRESS,EMAIL,PASSWORD,NAME,CITY,LONGITUDE,STATE,SOURCE,BIRTH_DATE,ZIP,LATITUDE,CREATED_AT,")
                                           :type "text/html; charset=utf-8"}]}
                               email)))})

    (testing "respect field-order"
      (test-row-notification!
       {:event_name :event/row.updated
        :table      :people}
       (fn [notification]
         (t2/update! :model/Table (mt/id :people) {:field_order :alphabetical})
         (mt/with-temp [:model/ChannelTemplate {tmpl-id :id} {:name "My Custom template"
                                                              :channel_type :channel/email
                                                              :details {:type :email/handlebars-text
                                                                        :subject "Hello"
                                                                        :body (str "Row: {{#each record}}{{@key}},{{/each}}\n"
                                                                                   "Changes: {{#each changes}}{{@key}},{{/each}}")}}]
           (t2/update! :model/NotificationHandler (->> notification :handlers first :id) {:template_id tmpl-id})
           (mt/user-http-request
            :crowberto
            :put
            (data-editing.tu/table-url (mt/id :people))
            {:rows [{:ID 1 :NAME "Ngoc Khuat" :CITY "Ha Noi" :EMAIL "ngoc@metabase.com"}]})))
       {:channel/email (fn [[email :as _emails]]
                         (is (=? {:body    [{:content (str "Row: ADDRESS,BIRTH_DATE,CITY,CREATED_AT,EMAIL,ID,LATITUDE,LONGITUDE,NAME,PASSWORD,SOURCE,STATE,ZIP,\n"
                                                           "Changes: ADDRESS,BIRTH_DATE,CITY,CREATED_AT,EMAIL,ID,LATITUDE,LONGITUDE,NAME,PASSWORD,SOURCE,STATE,ZIP,")
                                             :type "text/html; charset=utf-8"}]}
                                 email)))}))))

(deftest record-and-changes-is-coerced-properly
  (actions.tu/with-actions-test-data-tables #{"categories"}
    (test-row-notification!
     {:event_name :event/row.updated}
     (fn [notification]
       ;; why testing coercion against the name column?
       ;; for one it's quite hard to setup custom test data so I decided to just roll with it
       ;; but also this test that failure in coercion is ignored (e.g: failed to convert name to datetime)
       (mt/with-temp [:model/ChannelTemplate {tmpl-id :id} {:name "My Custom template"
                                                            :channel_type :channel/email
                                                            :details {:type :email/handlebars-text
                                                                      :subject "Hello"
                                                                      :body (str "Name: {{record.NAME}}\n"
                                                                                 "Name: {{changes.NAME.before}}\n"
                                                                                 "Name: {{changes.NAME.after}}")}}]
         (t2/update! :model/NotificationHandler (->> notification :handlers first :id) {:template_id tmpl-id})
         (t2/update! :model/Field (mt/id :categories :name) {:coercion_strategy :Coercion/ISO8601->Date})
         (mt/user-http-request
          :crowberto
          :put
          (data-editing.tu/table-url (mt/id :categories))
          {:rows [{:ID 1 :NAME "2025-03-25T00:00:00Z"}]})))
     {:channel/email (fn [[email :as _emails]]
                       (is (=? {:body    [{:content "Name: 2025-03-25T00:00Z[UTC]\nName: African\nName: 2025-03-25T00:00Z[UTC]"
                                           :type "text/html; charset=utf-8"}]}
                               email)))})))

(deftest create-row-notification-webhook-test
  (test-row-notification!
   {:event_name :event/row.created}
   (fn [_notification]
     (let [token (:token (mt/user-http-request :crowberto
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
    (doseq [event [:event/row.created
                   :event/row.updated
                   :event/row.deleted]]
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
  (is (=? {:context {:event_name "event/row.created"}
           :creator {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table {:id 1 :name "orders"}
           :settings {}
           :record {:id 1 :name "Product A" :price 29.99 :status "active"}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/row.created}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest example-payload-row-update-test
  (is (=? {:context {:event_name "event/row.updated"}
           :creator {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table {:id 1 :name "orders"}
           :settings {}
           :record {:id 1 :name "Product A" :price 24.99 :status "on sale"}
           :changes {:price {:before 29.99 :after 24.99} :status {:before "active" :after "on sale"}}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/row.updated}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest example-payload-row-delete-test
  (is (=? {:context {:event_name "event/row.deleted"}
           :creator {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :editor {:first_name "Meta" :last_name "Bot" :common_name "Meta Bot" :email "bot@metabase.com"}
           :table {:id 1 :name "orders"}
           :settings {}
           :record {:id 1 :name "Product A" :price 24.99 :status "discontinued"}}
          (:payload (mt/user-http-request :crowberto :post 200 "notification/payload"
                                          {:payload_type :notification/system-event
                                           :payload      {:event_name :event/row.deleted}
                                           :creator_id   (mt/user->id :crowberto)})))))

(deftest preview-notification-test
  (is (=? {:context  (mt/malli=? :map)
           :rendered {:from    "notifications@metabase.com"
                      :bcc     ["bot@metabase.com"]
                      :subject "Meta Bot has created a row for orders"
                      :body    [{:type "text/html; charset=utf-8" :content "New record: active"}]}}
          (mt/user-http-request :crowberto :post 200 "notification/preview_template"
                                {:template     {:channel_type :channel/email
                                                :details {:type    :email/handlebars-text
                                                          :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                          :body    "New record: {{record.status}}"}}
                                 :notification {:payload_type :notification/system-event
                                                :payload      {:event_name :event/row.created}}}))))

(deftest preview-notification-custom-payload-test
  (testing "use the custom context if it's valid"
    (is (=? {:context  (mt/malli=? :map)
             :rendered {:from    "notifications@metabase.com"
                        :bcc     ["bot@metabase.com"]
                        :subject "Ngoc Khuat has created a row for orders"
                        :body    [{:type "text/html; charset=utf-8" :content "New record: cancelled"}]}}
            (mt/user-http-request :crowberto :post 200 "notification/preview_template"
                                  {:template     {:channel_type :channel/email
                                                  :details {:type    :email/handlebars-text
                                                            :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                            :body    "New record: {{record.status}}"}}
                                   :notification   {:payload_type :notification/system-event
                                                    :payload      {:event_name :event/row.created}}
                                   :custom_context {:context {:event_name :event/row.created
                                                              :timestamp  "2023-01-01T10:00:00Z"}
                                                    :creator {:common_name "Meta Bot",
                                                              :email "bot@metabase.com",
                                                              :first_name "Meta",
                                                              :last_name "Bot"},
                                                    :editor {:common_name "Ngoc Khuat",
                                                             :email "ngoc@metabase.com",
                                                             :first_name "Ngoc",
                                                             :last_name "Khuat"},
                                                    :record {:id 1, :status "cancelled"}
                                                    :settings {},
                                                    :table {:id 1, :name "orders" :url "http://localhost:3000/table/1"}}}))))
  (testing "fail if the custom context does not match the schema"
    (is (=? {:message "Value does not match schema"
             :data    {:error (mt/malli=? :map)}}
            (mt/user-http-request :crowberto :post 500 "notification/preview_template"
                                  {:template     {:channel_type :channel/email
                                                  :details {:type    :email/handlebars-text
                                                            :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                            :body    "Created {{count records}} records"}}
                                   :notification   {:payload_type :notification/system-event
                                                    :payload      {:event_name :event/row.created}}
                                   :custom_context {::context true}})))))

(deftest custom-template-test
  (data-editing.tu/with-temp-test-db!
    (mt/with-temp [:model/Channel        {http-chn :id} {:type :channel/http}
                   :model/ChannelTemplate {http-tmpl :id} {:channel_type :channel/http
                                                           :details {:type :http/handlebars-text
                                                                     :body "{\"record\": {{{json-encode record}}}, \"new_name\": \"{{changes.NAME.after}}\" }"}}
                   :model/ChannelTemplate {slack-tmpl :id} {:channel_type :channel/slack
                                                            :details {:type :slack/handlebars-text
                                                                      :body "Name Was changed from {{changes.NAME.before}} to {{record.NAME}}"}}
                   :model/ChannelTemplate {email-tmpl :id} {:channel_type :channel/email
                                                            :details {:type :email/handlebars-text
                                                                      :subject "{{editor.first_name}} {{editor.last_name}} has created a row for {{table.name}}"
                                                                      :body "New record: {{record.status}}"}}]
      (notification.tu/with-system-event-notification!
        [_notification {:notification-system-event {:event_name :event/row.updated
                                                    :table_id   (mt/id :categories)}
                        :handlers                  [{:channel_type :channel/email
                                                     :template_id  email-tmpl
                                                     :recipients [{:type :notification-recipient/user
                                                                   :user_id (mt/user->id :crowberto)}]}
                                                    {:channel_type :channel/slack
                                                     :template_id  slack-tmpl
                                                     :recipients [{:type :notification-recipient/raw-value
                                                                   :details {:value "#test-pulse"}}]}
                                                    {:channel_type :channel/http
                                                     :template_id  http-tmpl
                                                     :channel_id   http-chn}]}]
        (is (=? {:channel/email [{:bcc     ["crowberto@metabase.com"]
                                  :body    [{:content "New record: "
                                             :type    "text/html; charset=utf-8"}]
                                  :from    "notifications@metabase.com"
                                  :subject "Crowberto Corv has created a row for CATEGORIES"}]
                 :channel/http [{:body {"record" {"ID" 1, "NAME" "Updated Category"}
                                        "new_name" "Updated Category"}}]
                 :channel/slack [{:attachments [{:blocks [{:text {:text "Name Was changed from African to Updated Category"
                                                                  :type "mrkdwn"}
                                                           :type "section"}]}]
                                  :channel-id "#test-pulse"}]}
                (notification.tu/with-captured-channel-send!
                  (notification.tu/with-channel-fixtures [:channel/email :channel/slack]
                    (mt/user-http-request
                     :crowberto
                     :put
                     (data-editing.tu/table-url (mt/id :categories))
                     {:rows [{:ID 1 :NAME "Updated Category"}]})))))))))
