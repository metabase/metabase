(ns metabase-enterprise.advanced-config.models.notification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.email.messages :as messages]
   [metabase.notification.models :as models.notification]
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest validate-email-domains-test
  (mt/with-temp [:model/Pulse {pulse-id :id}]
    (doseq [operation       [:create :update]
            allowed-domains [nil
                             #{"metabase.com"}
                             #{"metabase.com" "toucan.farm"}]
            emails          [nil
                             ["cam@metabase.com"]
                             ["cam@metabase.com" "cam@toucan.farm"]
                             ["cam@metabase.com" "cam@disallowed-domain.com"]]
            :let            [fail? (and allowed-domains
                                        (not (every? (fn [email]
                                                       (contains? allowed-domains (u/email->domain email)))
                                                     emails)))]]
      (mt/with-premium-features #{:email-allow-list}
        (mt/with-temporary-setting-values [subscription-allowed-domains (str/join "," allowed-domains)]
          ;; `with-premium-features` and `with-temporary-setting-values` will add `testing` context for the other
          ;; stuff.
          (testing (str (format "\nOperation = %s" operation)
                        (format "\nEmails = %s" (pr-str emails)))
            (let [thunk (case operation
                          :create
                          #(first (t2/insert-returning-instances! :model/PulseChannel
                                                                  (merge (mt/with-temp-defaults :model/PulseChannel)
                                                                         {:pulse_id pulse-id, :details {:emails emails}})))

                          :update
                          #(mt/with-temp [:model/PulseChannel {pulse-channel-id :id} {:pulse_id pulse-id}]
                             (t2/update! :model/PulseChannel pulse-channel-id {'details {:emails emails}})))]
              (if fail?
                (testing "should fail"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The following email addresses are not allowed: .*"
                       (thunk))))
                (testing "should succeed"
                  (is (thunk)))))))))))

(defn- api:unsubscribe-undo
  [expected-status handler-id email]
  (mt/client :post expected-status "notification/unsubscribe/undo"
             {:notification-handler-id handler-id
              :email                   email
              :hash                    (messages/generate-notification-unsubscribe-hash handler-id email)}))

(deftest notification-recipient-validate-email-domains-test
  (testing "every write path of a raw-value NotificationRecipient enforces subscription-allowed-domains (SEC-662)"
    (mt/with-premium-features #{:email-allow-list}
      (mt/with-temporary-setting-values [subscription-allowed-domains "metabase.com"]
        (notification.tu/with-card-notification
          [notification {:handlers [{:channel_type :channel/email
                                     :recipients   []}]}]
          (let [handler-id (-> notification :handlers first :id)]
            (testing "direct insert of a disallowed email fails"
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"The following email addresses are not allowed: .*"
                   (t2/insert! :model/NotificationRecipient
                               {'type                    :notification-recipient/raw-value
                                'details                 {:value "cam@disallowed-domain.com"}
                                'notification_handler_id handler-id}))))
            (testing "POST /api/notification/unsubscribe/undo with a disallowed email fails"
              (is (= "The following email addresses are not allowed: cam@disallowed-domain.com"
                     (api:unsubscribe-undo 403 handler-id "cam@disallowed-domain.com")))
              (is (not (t2/exists? :model/NotificationRecipient 'notification_handler_id handler-id))))
            (testing "POST /api/notification/unsubscribe/undo with an allowed email succeeds"
              (is (=? {:status "success"}
                      (api:unsubscribe-undo 200 handler-id "cam@metabase.com")))
              (is (t2/exists? :model/NotificationRecipient 'notification_handler_id handler-id)))))))))

(deftest validate-email-handlers!-test
  (testing "the send-time check reuses validate-email-handlers!, which throws on a disallowed raw external recipient"
    (let [handler (fn [email] {:channel_type :channel/email
                               :recipients   [{:type :notification-recipient/raw-value :details {:value email}}
                                              {:type :notification-recipient/user :user {:email "someone@evil.com"}}]})]
      (mt/with-premium-features #{:email-allow-list}
        (mt/with-temporary-setting-values [subscription-allowed-domains "metabase.com"]
          (testing "throws for a disallowed external recipient"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"not allowed"
                 (models.notification/validate-email-handlers! [(handler "attacker@evil.com")]))))
          (testing "does not throw for an allowed external recipient (user recipients are never domain-checked)"
            (is (nil? (models.notification/validate-email-handlers! [(handler "cam@metabase.com")]))))))
      (testing "no-op without the :email-allow-list feature"
        (mt/with-premium-features #{}
          (mt/with-temporary-setting-values [subscription-allowed-domains "metabase.com"]
            (is (nil? (models.notification/validate-email-handlers! [(handler "attacker@evil.com")])))))))))
