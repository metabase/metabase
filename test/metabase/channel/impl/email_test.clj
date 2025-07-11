(ns metabase.channel.impl.email-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.channel.email :as email]
   [metabase.channel.impl.email :as email.impl]
   [metabase.channel.render.util :as render.util]
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
          (channel/send! {:type :channel/email} {:subject "Test"
                                                 :from    "hi@metabase.com"
                                                 :to      ["ngoc@metabase.com"]
                                                 :body    [{:type :text/html
                                                            :content "Test"}]})
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
