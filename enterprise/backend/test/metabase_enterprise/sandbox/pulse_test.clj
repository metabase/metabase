(ns metabase-enterprise.sandbox.pulse-test
  #_{:clj-kondo/ignore [:deprecated-namespace]}
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.api.alert :as api.alert]
   [metabase.models.pulse :as models.pulse]
   [metabase.notification.payload.execute :as notification.payload.execute]
   [metabase.notification.send :as notification.send]
   [metabase.notification.test-util :as notification.tu]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.pulse.send :as pulse.send]
   [metabase.pulse.test-util :as pulse.test-util]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :each (fn [thunk]
                      (notification.tu/with-send-notification-sync
                        (thunk))))

(set! *warn-on-reflection* true)

(deftest sandboxed-alert-test
  (testing "Pulses should get sent with the row-level restrictions of the User that created them."
    (letfn [(send-pulse-created-by-user! [user-kw]
              (met/with-gtaps! {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                                      :remappings {:cat ["variable" [:field (mt/id :venues :category_id) nil]]}}}
                                :attributes {"cat" 50}}
                (t2.with-temp/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
                  ;; `with-gtaps!` binds the current test user; we don't want that falsely affecting results
                  (mt/with-test-user nil
                    (pulse.test-util/send-alert-created-by-user! user-kw card)))))]
      (is (= [[100]]
             (send-pulse-created-by-user! :crowberto)))
      (is (= [[10]]
             (send-pulse-created-by-user! :rasta))))))

(defn- alert-results!
  "Results for creating and running an Alert"
  [query]
  (mt/with-temp [:model/Card                  pulse-card {:name          "Test card"
                                                          :dataset_query query}
                 :model/Pulse                 pulse {:alert_condition "rows"}
                 :model/PulseCard             _ {:pulse_id (:id pulse), :card_id (:id pulse-card)}
                 :model/PulseChannel          pc {:channel_type :email
                                                  :pulse_id     (:id pulse)
                                                  :enabled      true}
                 :model/PulseChannelRecipient _ {:pulse_channel_id (:id pc)
                                                 :user_id          (mt/user->id :rasta)}]
    (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"]
      (let [pulse (models.pulse/retrieve-pulse pulse)]
        (-> (notification.payload.execute/execute-card (:creator_id pulse) (-> pulse :cards first :id)) :result)))))

(deftest dashboard-subscription-send-event-test
  (testing "When we send a pulse, we also log the event:"
    (mt/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp
        [:model/Card                  pulse-card {:dataset_query (mt/mbql-query venues {:limit 1})}
         :model/Dashboard             dashboard {:name "Test Dashboard"}
         :model/Pulse                 pulse {:creator_id (mt/user->id :crowberto)
                                             :name "Test Pulse"
                                             :alert_condition "rows"
                                             :dashboard_id (:id dashboard)}
         :model/PulseCard             _ {:pulse_id (:id pulse)
                                         :card_id (:id pulse-card)}
         :model/PulseChannel          pc {:channel_type :email
                                          :pulse_id     (:id pulse)
                                          :enabled      true}
         :model/PulseChannelRecipient _ {:pulse_channel_id (:id pc)
                                         :user_id          (mt/user->id :rasta)}]
        (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"]
          (mt/with-fake-inbox
            (with-redefs [notification.send/channel-send-retrying!  (fn [_ _ _ _] :noop)]
              (mt/with-test-user :lucky
                (pulse.send/send-pulse! pulse)))
            (is (= {:topic    :subscription-send
                    :user_id  (mt/user->id :crowberto)
                    :model    "Pulse"
                    :model_id (:id pulse)
                    :details  {:recipients [(dissoc (mt/fetch-user :rasta) :last_login :is_qbnewb :is_superuser :date_joined)]
                               :filters    nil}}
                   (mt/latest-audit-log-entry :subscription-send (:id pulse))))))))))

(deftest alert-send-event-test
  (testing "When we send an alert, we also log the event:"
    (mt/with-premium-features #{:audit-app}
      (t2.with-temp/with-temp [:model/Card                  pulse-card {:dataset_query (mt/mbql-query venues)}
                               :model/Pulse                 pulse {:creator_id (mt/user->id :crowberto)
                                                                   :name "Test Pulse"
                                                                   :alert_condition "rows"}
                               :model/PulseCard             _ {:pulse_id (:id pulse)
                                                               :card_id (:id pulse-card)}
                               :model/PulseChannel          pc {:channel_type :email
                                                                :pulse_id     (:id pulse)
                                                                :enabled      true}
                               :model/PulseChannelRecipient _ {:pulse_channel_id (:id pc)
                                                               :user_id          (mt/user->id :rasta)}]
        (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"]
          (mt/with-fake-inbox
            (mt/with-test-user :lucky
              (pulse.send/send-pulse! pulse))
            (is (= {:topic    :alert-send
                    :user_id  (mt/user->id :crowberto)
                    :model    "Pulse"
                    :model_id (:id pulse)
                    :details  {:recipients [(dissoc (mt/fetch-user :rasta) :last_login :is_qbnewb :is_superuser :date_joined)]
                               :filters    nil}}
                   (mt/latest-audit-log-entry :alert-send (:id pulse))))))))))

(deftest e2e-sandboxed-pulse-test
  (testing "Sending Pulses w/ sandboxing, end-to-end"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues
                                                {:filter [:= $price 3]})}}}
      (let [query (mt/mbql-query venues
                    {:aggregation [[:count]]
                     :breakout    [$price]})]
        (is (= [[3 13]]
               (mt/formatted-rows
                [int int]
                (mt/with-test-user :rasta
                  (qp/process-query query))))
            "Basic sanity check: make sure the query is properly set up to apply GTAPs")
        (testing "GTAPs should apply to Pulses — they should get the same results as if running that query normally"
          (is (= [[3 13]]
                 (mt/rows
                  (alert-results! query)))))))))

(defn- html->row-count [html]
  (or (some->> html (re-find #"of <strong.+>(\d+)</strong> rows") second Integer/parseUnsignedInt)
      html))

(defn- csv->row-count [attachment-url]
  (when attachment-url
    (with-open [reader (io/reader attachment-url)]
      (count (csv/read-csv reader)))))

(deftest user-attributes-test
  (testing "Pulses should be sandboxed correctly by User login_attributes"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                      :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (t2.with-temp/with-temp [:model/Card card {:dataset_query query}]
            (testing "Sanity check: make sure user is seeing sandboxed results outside of Pulses"
              (testing "ad-hoc query"
                (is (= 22
                       (count (mt/rows (qp/process-query query))))))

              (testing "in a Saved Question"
                (is (= 22
                       (count (mt/rows (mt/user-http-request :rasta :post 202 (format "card/%d/query" (u/the-id card)))))))))

            (testing "Pulse should be sandboxed"
              (is (= 22
                     (count (mt/rows (alert-results! query))))))))))))

(deftest pulse-preview-test
  (testing "Pulse preview endpoints should be sandboxed"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                      :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (t2.with-temp/with-temp [:model/Card card {:dataset_query query}]
            (testing "GET /api/pulse/preview_card/:id"
              (is (= 22
                     (html->row-count (mt/user-http-request :rasta :get 200 (format "pulse/preview_card/%d" (u/the-id card)))))))
            (testing "POST /api/pulse/test"
              (mt/with-fake-inbox
                (mt/user-http-request :rasta :post 200 "pulse/test" {:name     "venues"
                                                                     :alert_condition "rows"
                                                                     :cards    [{:id          (u/the-id card)
                                                                                 :include_csv true
                                                                                 :include_xls false}]
                                                                     :channels [{:channel_type  :email
                                                                                 :schedule_type "hourly"
                                                                                 :enabled       :true
                                                                                 :recipients    [{:id    (mt/user->id :rasta)
                                                                                                  :email "rasta@metabase.com"}]}]})
                (let [[{html :content} {_icon :content} {attachment :content}] (get-in @mt/inbox ["rasta@metabase.com" 0 :body])]
                  (testing "email"
                    (is (= 22
                           (html->row-count html))))
                  (testing "CSV attachment"
                    ;; one extra row because first row is column names
                    (is (= 23
                           (csv->row-count attachment)))))))))))))

(deftest csv-downloads-test
  (testing "CSV/XLSX downloads attached to an email should be sandboxed"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:price [:dimension [:field (mt/id :venues :price) nil]]}}}
                      :attributes {"price" "1"}}
      (let [query (mt/mbql-query venues)]
        (mt/with-test-user :rasta
          (mt/with-temp [:model/Card                 {card-id :id}  {:dataset_query query}
                         :model/Pulse                {pulse-id :id} {:name            "Pulse Name"
                                                                     :skip_if_empty   false
                                                                     :alert_condition "rows"}
                         :model/PulseCard             _             {:pulse_id pulse-id
                                                                     :card_id  card-id
                                                                     :position 0
                                                                     :include_csv true}
                         :model/PulseChannel          {pc-id :id}   {:pulse_id pulse-id}
                         :model/PulseChannelRecipient _             {:user_id          (mt/user->id :rasta)
                                                                     :pulse_channel_id pc-id}]
            (mt/with-fake-inbox
              (mt/with-test-user nil
                (pulse.send/send-pulse! (models.pulse/retrieve-alert pulse-id)))
              (let [email-results                           @mt/inbox
                    [{html :content} {_icon :attachment} {attachment :content}] (get-in email-results ["rasta@metabase.com" 0 :body])]
                (testing "email"
                  (is (= 22
                         (html->row-count html))))
                (testing "CSV attachment"
                  (is (= 23
                         (csv->row-count attachment))))))))))))

(deftest sandboxed-users-cant-read-pulse-recipients
  (testing "When sandboxed users fetch a pulse hydrated with recipients, they should only see themselves"
    (mt/with-temp [:model/Pulse        {pulse-id :id} {:name "my pulse"}
                   :model/PulseChannel {pc-id :id} {:pulse_id     pulse-id
                                                    :channel_type :email}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id (mt/user->id :crowberto)}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id (mt/user->id :rasta)}]
      (let [recipient-ids (fn [pulses]
                            (let [pulse      (first (filter #(= pulse-id (:id %)) pulses))
                                  recipients (-> pulse :channels first :recipients)]
                              (sort (map :id recipients))))]
        (mt/with-test-user :rasta
          (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly false)]
            (is (= (sort [(mt/user->id :rasta) (mt/user->id :crowberto)])
                   (-> (mt/user-http-request :rasta :get 200 "pulse/")
                       recipient-ids)))

            (is (= (sort [(mt/user->id :rasta) (mt/user->id :crowberto)])
                   (-> (mt/user-http-request :rasta :get 200 (format "pulse/%d" pulse-id))
                       vector
                       recipient-ids))))

          (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
            (is (= [(mt/user->id :rasta)]
                   (-> (mt/user-http-request :rasta :get 200 "pulse/")
                       recipient-ids)))

            (is (= [(mt/user->id :rasta)]
                   (-> (mt/user-http-request :rasta :get 200 (format "pulse/%d" pulse-id))
                       vector
                       recipient-ids)))))))))

(deftest sandboxed-users-cant-delete-pulse-recipients
  (testing "When sandboxed users update a pulse, Metabase users in the recipients list are not deleted, even if they
           are not included in the request."
    (mt/with-temp [:model/Pulse        {pulse-id :id} {:name            "my pulse"
                                                       :alert_condition "rows"}
                   :model/PulseChannel {pc-id :id :as pc} {:pulse_id     pulse-id
                                                           :channel_type :email
                                                           :details      {:emails "asdf@metabase.com"}}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id (mt/user->id :crowberto)}
                   :model/PulseChannelRecipient _ {:pulse_channel_id pc-id :user_id (mt/user->id :rasta)}]

      (mt/with-test-user :rasta
        (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
          ;; Rasta, a sandboxed user, updates the pulse, but does not include Crowberto in the recipients list
          (mt/user-http-request :rasta :put 200 (format "pulse/%d" pulse-id)
                                {:channels [(assoc pc :recipients [{:id (mt/user->id :rasta)}])]}))

        ;; Check that both Rasta and Crowberto are still recipients
        (is (= (sort [(mt/user->id :rasta) (mt/user->id :crowberto)])
               (->> (api.alert/email-channel (models.pulse/retrieve-alert pulse-id)) :recipients (map :id) sort)))

        (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly false)]
          ;; Rasta, a non-sandboxed user, updates the pulse, but does not include Crowberto in the recipients list
          (mt/user-http-request :rasta :put 200 (format "pulse/%d" pulse-id)
                                {:channels [(assoc pc :recipients [{:id (mt/user->id :rasta)}])]})

          ;; Crowberto should now be removed as a recipient
          (is (= [(mt/user->id :rasta)]
                 (->> (api.alert/email-channel (models.pulse/retrieve-alert pulse-id)) :recipients (map :id) sort))))))))
