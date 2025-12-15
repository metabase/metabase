(ns metabase.channel.impl.email-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.email :as email]
   [metabase.channel.impl.email :as email.impl]
   [metabase.channel.render.util :as render.util]
   [metabase.channel.urls :as urls]
   [metabase.test :as mt]))

(deftest bcc-enabled-test
  (testing "When bcc is not enabled, return an email that uses to:"
    (let [sent-message (atom nil)]
      (with-redefs [email/send-email! (fn [_ message]
                                        (reset! sent-message message))]
        (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"
                                           email-smtp-host    "fake_smtp_host"
                                           email-smtp-port    587
                                           bcc-enabled?       false]
          (channel/send! {:type :channel/email} {:subject      "Test"
                                                 :recipients   ["ngoc@metabase.com"]
                                                 :message-type :html
                                                 :message      "Test message"})
          (is (=? {:to ["ngoc@metabase.com"]}
                  @sent-message)))))))

(deftest assoc-attachment-booleans-test
  (testing "assoc-attachment-booleans function"
    (testing "handles visualizer dashcards by matching on both card_id and dashboard_card_id"
      (let [visualizer-dashcard {:id 100
                                 :visualization_settings {:visualization {}}}
            visualizer-part {:card {:id 1 :name "Visualizer Card"}
                             :dashcard visualizer-dashcard}
            matching-part-config {:card_id 1
                                  :dashboard_card_id 100
                                  :include_csv true
                                  :include_xls true}
            result (with-redefs [render.util/is-visualizer-dashcard? (constantly true)]
                     (#'email.impl/assoc-attachment-booleans [matching-part-config] [visualizer-part]))]

        (is (true? (-> result first :card :include_csv))
            "Should include CSV attachment setting from matching part config")
        (is (true? (-> result first :card :include_xls))
            "Should include XLS attachment setting from matching part config")))

    (testing "falls back to matching on card_id only when no perfect visualizer match is found"
      (let [regular-dashcard {:id 200}
            regular-part {:card {:id 2 :name "Regular Card"}
                          :dashcard regular-dashcard}
            matching-part-config {:card_id 2
                                  :dashboard_card_id 999 ;; Different from the dashcard.id
                                  :include_csv true
                                  :format_rows true}
            result (#'email.impl/assoc-attachment-booleans [matching-part-config] [regular-part])]

        (is (true? (-> result first :card :include_csv))
            "Should include CSV attachment setting using the fallback match")
        (is (true? (-> result first :card :format_rows))
            "Should include format_rows setting using the fallback match")))))

(deftest dashboard-notification-dashcard-links-test
  (testing "Dashboard notification renders dashcard links with parameters like Slack implementation"
    (let [dashboard-id 42
          card-id 123
          dashcard-id 456
          dashboard-params [{:name "State"
                             :slug "state"
                             :id "63e719d0"
                             :default ["CA" "NY" "NJ"]
                             :type "string/="
                             :sectionId "location"}]
          notification {:payload_type :notification/dashboard
                        :payload {:dashboard {:id dashboard-id
                                              :name "Test Dashboard"}
                                  :parameters dashboard-params
                                  :dashboard_parts [{:type :card
                                                     :card {:id card-id
                                                            :name "Test Card"}
                                                     :dashcard {:id dashcard-id
                                                                :dashboard_id dashboard-id}}]
                                  :dashboard_subscription {:id 789
                                                           :dashboard_subscription_dashcards []}}}
          recipients [{:type :notification-recipient/user
                       :user {:email "test@example.com"}}]]
      (mt/with-temporary-setting-values [site-url "http://example.com"]
        (binding [urls/*dashcard-parameters* dashboard-params]
          (let [result (channel/render-notification :channel/email notification {:recipients recipients})
                rendered-content (-> result first :message first :content)]

            (testing "Dashboard parameters are bound during rendering"
              (is (some? result))
              (is (= 1 (count result)))
              (is (string? rendered-content))
              (is (str/includes? rendered-content "http://example.com/dashboard/42?state=CA&amp;state=NY&amp;state=NJ#scrollTo=456")))))))))
