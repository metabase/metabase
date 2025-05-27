(ns metabase.channel.impl.slack-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.slack :as channel.slack]
   [metabase.channel.slack :as slack]
   [metabase.config.core :as config]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(deftest slack-post-receives-at-most-50-blocks-test
  (let [block-inputs (atom [])]
    (with-redefs [slack/post-chat-message! (fn [message-content] (swap! block-inputs conj (:blocks message-content)))]
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
        processed   (with-redefs [slack/upload-file! (fn [_ _]
                                                       {:id "uploaded"})]
                      (mt/with-temporary-setting-values [site-url "a.com"]
                        (mapv #'channel.slack/part->sections! parts)))]
    (is (= [[{:type "section", :text {:type "mrkdwn", :text "<http://a.com/question/1|&amp;amp;a>"}}
             {:type "section", :text {:type "plain_text", :text "No results"}}]
            [{:type "section",
              :text
              {:type "mrkdwn", :text "<http://a.com/question/1|&gt; click &lt;https://c.com|here&gt;>"}}
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
                               (channel/render-notification :channel/slack :notification/dashboard notification nil [recipient]))]
            (-> processed first :blocks first :text :text)))]
    (are [dashboard-name rendered-text]
         (= rendered-text (render-dashboard-header dashboard-name 5))
      "abc"    "abc"
      "abcde"  "abcde"
      "abcdef" "abcd…")))

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
                      processed    (with-redefs [slack/upload-file! (constantly {:url "a.com", :id "id"})]
                                     (channel/render-notification :channel/slack :notification/dashboard notification nil [recipient]))]
                  (->> processed first :blocks second :fields (map :text))))))
          (markdown-link? [s]
            (is (string? s))
            (let [[_whole url label] (re-find #"\<(.*)\|(.*)\>" s)]
              (is (string? label))
              (is (u/url? url))))]
    (when config/ee-available?
      (testing "When whitelabeling is enabled, branding link should not be included"
        (let [links (render-dashboard-links true)]
          (is (every? markdown-link? links))
          (is (= 1 (count links))))))
    (testing "When whitelabeling is disabled, branding link should be included"
      (let [links (render-dashboard-links false)]
        (is (every? markdown-link? links))
        (is (= 2 (count links)))))))
