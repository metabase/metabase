(ns metabase.channel.impl.slack-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.channel.slack :as slack]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest notification-recipient->channel-prefers-channel-id-test
  (testing "prefers channel_id over value when both are present"
    (is (= "C0ABC123"
           (#'channel.slack/notification-recipient->channel
            {:type    :notification-recipient/raw-value
             :details {:value "#my-channel" :channel_id "C0ABC123"}}))))
  (testing "falls back to value when channel_id is absent"
    (is (= "#my-channel"
           (#'channel.slack/notification-recipient->channel
            {:type    :notification-recipient/raw-value
             :details {:value "#my-channel"}}))))
  (testing "returns channel_id even when value is nil"
    (is (= "C0ABC123"
           (#'channel.slack/notification-recipient->channel
            {:type    :notification-recipient/raw-value
             :details {:channel_id "C0ABC123"}}))))
  (testing "returns nil for non-raw-value recipient types"
    (is (nil? (#'channel.slack/notification-recipient->channel
               {:type    :notification-recipient/user
                :details {:value "#my-channel" :channel_id "C0ABC123"}})))))

(deftest slack-post-receives-at-most-50-blocks-test
  (let [block-inputs (atom [])]
    (mt/with-dynamic-fn-redefs [slack/post-chat-message! (fn [message-content] (swap! block-inputs conj (:blocks message-content)))]
      (channel/send!
       {:type    :channel/slack}
       {:channel "#not-a-channel"
        :blocks  (repeat 423 {:type "section", :text {:type "plain_text", :text ""}})})
      (is (== (Math/ceil (/ 423 50)) (count @block-inputs)))
      (is (every? #(<= 1 (count %) 50) @block-inputs))
      (is (= 423 (reduce + (map count @block-inputs)))))))

(deftest mkdwn-link-escaping-test
  (let [parts [{:type :card
                :card {:id   1
                       :name "&amp;a"}}
               {:type :card
                :card {:id   1
                       :name "> click <https://c.com|here>"}}]
        processed   (mt/with-dynamic-fn-redefs [slack/upload-file! (fn [_ _]
                                                                     {:id "uploaded"})]
                      (mt/with-temporary-setting-values [site-url "a.com"]
                        (mapv #'channel.slack/part->sections! parts)))]
    (is (= [[{:type "section", :text {:type "mrkdwn", :text "<http://a.com/question/1|&amp;amp;a>", :verbatim true}}
             {:type "section", :text {:type "plain_text", :text "No results"}}]
            [{:type "section",
              :text
              {:type "mrkdwn", :text "<http://a.com/question/1|&gt; click &lt;https://c.com|here&gt;>", :verbatim true}}
             {:type "section", :text {:type "plain_text", :text "No results"}}]]
           processed))))

(deftest link-truncation-test
  (let [render-image-link
        (fn [label card-id char-limit]
          (let [part        [{:type :card
                              :card {:id   card-id
                                     :name label}}]
                processed   (with-redefs [channel.slack/block-text-length-limit char-limit
                                          slack/upload-file!                    (fn [_ _]
                                                                                  {:id "uploaded"})]
                              (mt/with-temporary-setting-values [site-url "a.com"]
                                (mapv #'channel.slack/part->sections! part)))]
            (-> processed first first :text :text)))]
    (are [label card-id mkdwn]
         (= mkdwn (render-image-link label card-id 36))
      "a"    1 "<http://a.com/question/1|a>"
      "abcd" 123456 "(URL exceeds slack limits) abcd")))

(deftest dashboard-header-truncation-test
  (let [render-dashboard-header
        (fn [dashboard-name char-limit]
          (let [notification {:payload_type :notification/dashboard
                              :payload      {:dashboard       {:id 42, :name dashboard-name}
                                             :parameters      {}
                                             :dashboard_parts []}
                              :creator      {:common_name "a"}}
                recipient    {:type    :notification-recipient/raw-value
                              :details {:value "#foo"}}
                processed    (with-redefs [channel.slack/header-text-limit char-limit]
                               (channel/render-notification :channel/slack notification {:recipients [recipient]}))]
            (-> processed first :blocks first :text :text)))]
    (are [dashboard-name rendered-text]
         (= rendered-text (render-dashboard-header dashboard-name 5))
      "abc"    "abc"
      "abcde"  "abcde"
      "abcdef" "abcd…")))

(deftest card-header-truncation-test
  (let [render-card-header
        (fn [card-name char-limit]
          (let [notification {:payload_type :notification/card
                              :payload      {:card {:name card-name}
                                             :card_part {:type :text, :text "foo"}}}
                recipient    {:type    :notification-recipient/raw-value
                              :details {:value "#foo"}}
                processed    (with-redefs [channel.slack/header-text-limit char-limit]
                               (channel/render-notification :channel/slack notification {:recipients [recipient]}))]
            (-> processed first :blocks first :text :text)))]
    (are [card-name rendered-text]
         (= rendered-text (render-card-header card-name 8))
      ;; note java String .length counts UTF-16 characters, so (count "🔔") == 2. This may lead to overestimation of lengths (depending on how slack measures 'characters')
      "abc"    "🔔 abc"
      "abcde"  "🔔 abcde"
      "abcdef" "🔔 abcd…")))

(deftest dashboard-header-branding-test
  (letfn [(render-dashboard-links [whitelabeling?]
            (mt/with-premium-features (if whitelabeling? #{:whitelabel} #{})
              (mt/with-temporary-setting-values [:site-url "https://www.example.com"]
                (let [notification {:payload_type :notification/dashboard
                                    :payload      {:dashboard       {:id 42, :name "Test Dashboard"}
                                                   :parameters      {}
                                                   :dashboard_parts []}
                                    :creator      {:common_name "Test User"}}
                      recipient    {:type    :notification-recipient/raw-value
                                    :details {:value "#foo"}}
                      processed    (mt/with-dynamic-fn-redefs [slack/upload-file! (constantly {:url "a.com", :id "id"})]
                                     (channel/render-notification :channel/slack notification {:recipients [recipient]}))]
                  (->> processed first :blocks last :fields (map :text))))))]
    (when config/ee-available?
      (testing "When whitelabeling is enabled, branding content should not be included"
        (let [links (render-dashboard-links true)]
          (is (= 1 (count links))))))
    (testing "When whitelabeling is disabled, branding content should be included"
      (let [links (render-dashboard-links false)]
        (is (= 2 (count links)))))))

(deftest dashboard-card-links-include-parameters-test
  (let [dashboard-id 42
        card-id 123
        dashboard-params [{:name "State",
                           :slug "state",
                           :id "63e719d0",
                           :default ["CA", "NY", "NJ"],
                           :type "string/=",
                           :sectionId "location"}]
        notification {:payload_type :notification/dashboard
                      :payload      {:dashboard       {:id dashboard-id :name "Test Dashboard"}
                                     :parameters      dashboard-params
                                     :dashboard_parts [{:type :card
                                                        :card {:id card-id :name "Test Card"}
                                                        :dashcard {:id 456 :dashboard_id dashboard-id}}]}
                      :creator      {:common_name "Test User"}}
        recipient {:type    :notification-recipient/raw-value
                   :details {:value "#test-channel"}}]
    (mt/with-dynamic-fn-redefs [slack/upload-file! (fn [_ _] {:id "uploaded-file-id"})]
      (mt/with-temporary-setting-values [site-url "http://example.com"]
        (let [processed (channel/render-notification :channel/slack notification {:recipients [recipient]})
              card-section (-> processed first :blocks (nth 3))]
          (is (= "section" (:type card-section)))
          (is (= "<http://example.com/dashboard/42?state=CA&state=NY&state=NJ#scrollTo=456|Test Card>"
                 (-> card-section :text :text))))))))
