(ns metabase.channel.email-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.core :as channel]
   [metabase.email :as email]
   [metabase.test :as mt]))

(deftest bcc-enabled-test
  (testing "When bcc is not enabled, return an email that uses to:"
    (let [sent-message (atom nil)]
      (with-redefs [email/send-email! (fn [_ message]
                                        (reset! sent-message message))]
        (mt/with-temporary-setting-values [email-from-address "metamailman@metabase.com"
                                           bcc-enabled?       false]
          (channel/send! :channel/email {:subject      "Test"
                                         :recipients   ["ngoc@metabase.com"]
                                         :message-type :html
                                         :message      "Test message"})
          (is (=? {:to ["ngoc@metabase.com"]}
                  @sent-message)))))))

;; TODO: add more render-notification tests
