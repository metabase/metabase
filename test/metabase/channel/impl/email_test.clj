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
      (mt/with-dynamic-fn-redefs [email/send-email! (fn [_ message]
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

(deftest email-channel-respects-recipient-cap-test
  (testing "channel/send! :channel/email splits oversized recipient lists into batches of at most `email-max-recipients-per-message`"
    (let [sent (atom [])]
      (mt/with-dynamic-fn-redefs [email/send-email! (fn [_ details]
                                                      (swap! sent conj (or (:bcc details) (:to details)))
                                                      details)]
        (mt/with-temporary-setting-values [email-from-address               "metamailman@metabase.com"
                                           email-smtp-host                  "fake_smtp_host"
                                           email-smtp-port                  587
                                           email-max-recipients-per-message 10]
          (let [recipients (mapv #(format "user-%03d@metabase.test" %) (range 25))]
            (channel/send! {:type :channel/email}
                           {:subject        "Job failed"
                            :recipients     recipients
                            :message-type   :html
                            :message        "<p>uh oh</p>"
                            :recipient-type :bcc})
            (testing "one SMTP call per batch — 25 recipients capped at 10 → 3 batches"
              (is (= 3 (count @sent))))
            (testing "no batch exceeds the cap"
              (is (every? #(<= (count %) 10) @sent)))
            (testing "every recipient appears exactly once, in order"
              (is (= recipients (vec (mapcat identity @sent))))
              (is (apply distinct? (mapcat identity @sent))))))))))

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
            result (mt/with-dynamic-fn-redefs [render.util/is-visualizer-dashcard? (constantly true)]
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

(deftest dashboard-subscription-part-error-isolation-test
  (testing "One card failing to render does not break the whole dashboard subscription; the failed
            card degrades to an error placeholder and the remaining cards still render (#74007)"
    (let [notification {:payload_type :notification/dashboard
                        :payload {:dashboard       {:id 1 :name "Test Dashboard"}
                                  :parameters      []
                                  :dashboard_parts [{:type :card :card {:id 1 :name "Good Card"} :dashcard {:id 10 :dashboard_id 1}}
                                                    {:type :card :card {:id 2 :name "Bad Card"}  :dashcard {:id 20 :dashboard_id 1}}]
                                  :dashboard_subscription {:id 9 :dashboard_subscription_dashcards []}}}
          recipients   [{:type :notification-recipient/user :user {:email "test@example.com"}}]]
      (mt/with-temporary-setting-values [site-url "http://example.com"]
        ;; The bad card returns lazy Hiccup that throws only when realized by `html` - the exact failure
        ;; mode where a render error escapes the per-card try/catch and would otherwise abort delivery.
        (mt/with-dynamic-fn-redefs [email.impl/render-part (fn [_timezone part _options]
                                                             (if (= 2 (-> part :card :id))
                                                               {:content [:div (lazy-seq (throw (ex-info "boom while realizing" {})))]}
                                                               {:content [:div "GOOD-CARD-BODY"]}))]
          (let [result  (channel/render-notification :channel/email notification {:recipients recipients})
                content (-> result first :message first :content)]
            (is (string? content))
            (testing "the healthy card still renders"
              (is (str/includes? content "GOOD-CARD-BODY")))
            (testing "the failed card degrades to the error placeholder"
              (is (str/includes? content "An error occurred while displaying this card.")))))))))

(deftest render-body-prometheus-metric-test
  (testing "rendering a user-provided template increments the template-render counter"
    (mt/with-prometheus-system! [_ system]
      (let [template {:details {:type :email/handlebars-text
                                :subject "Test"
                                :body "Hello {{name}}"}}]
        (#'email.impl/render-body template {:name "World"})
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-render
                                    {:template-type :email/handlebars-text
                                     :channel-type  :channel/email}))))))
  (testing "rendering a resource template also increments the counter with the correct label"
    (mt/with-prometheus-system! [_ system]
      (let [template {:details {:type :email/handlebars-resource
                                :subject "Test"
                                :path "metabase/channel/email/notification_card.hbs"}}]
        ;; render-body will throw if the payload doesn't match the template, but the metric
        ;; fires before the render, so we just need to not blow up
        (try (#'email.impl/render-body template {})
             (catch Exception _))
        (is (= 1.0 (mt/metric-value system :metabase-notification/template-render
                                    {:template-type :email/handlebars-resource
                                     :channel-type  :channel/email})))))))

(deftest notification-recipients-skips-api-key-users-test
  (testing "API-key users are filtered out of notification recipients (GDGT-2402)"
    (let [recipients [{:type :notification-recipient/group
                       :permissions_group {:members [{:email "alice@metabase.com"   :type :personal}
                                                     {:email "api-key-user-abc@api-key.invalid" :type :api-key}]}}
                      {:type :notification-recipient/user
                       :user {:email "api-key-user-def@api-key.invalid" :type :api-key}}
                      {:type :notification-recipient/raw-value
                       :details {:value "ops@metabase.com"}}]]
      (is (= ["alice@metabase.com" "ops@metabase.com"]
             (#'email.impl/notification-recipients->emails recipients {}))))))

(deftest render-body-logging-test
  (testing "rendering a user-provided template logs the template body at debug level"
    (mt/with-log-messages-for-level [messages :debug]
      (let [template {:details {:type :email/handlebars-text
                                :subject "Test"
                                :body "Hello {{name}}"}}]
        (#'email.impl/render-body template {:name "World"})
        (is (some (fn [{:keys [message]}]
                    (and (re-find #"Rendering user-provided template" message)
                         (re-find #"Hello" message)))
                  (messages)))))))
