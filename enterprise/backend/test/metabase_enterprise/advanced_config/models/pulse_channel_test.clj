(ns metabase-enterprise.advanced-config.models.pulse-channel-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.models.pulse-channel :as advanced-config.models.pulse-channel]
   [metabase.models :refer [Pulse PulseChannel]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest validate-email-domains-test
  (t2.with-temp/with-temp [Pulse {pulse-id :id}]
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
                          #(first (t2/insert-returning-instances! PulseChannel
                                                                  (merge (t2.with-temp/with-temp-defaults PulseChannel)
                                                                         {:pulse_id pulse-id, :details {:emails emails}})))

                          :update
                          #(t2.with-temp/with-temp [PulseChannel {pulse-channel-id :id} {:pulse_id pulse-id}]
                             (t2/update! PulseChannel pulse-channel-id {:details {:emails emails}})))]
              (if fail?
                (testing "should fail"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"You cannot create new subscriptions for the domain \"[\w@\.-]+\". Allowed domains are: .+"
                       (thunk))))
                (testing "should succeed"
                  (is (thunk)))))))))))

(deftest subscription-allowed-domains!-test
  (testing "Should be able to set the subscription-allowed-domains setting with the email-allow-list feature"
    (mt/with-premium-features #{:email-allow-list}
      (is (= "metabase.com"
             (advanced-config.models.pulse-channel/subscription-allowed-domains! "metabase.com")))))
  (testing "Should be unable to set the subscription-allowed-domains setting without the email-allow-list feature"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting subscription-allowed-domains is not enabled because feature :email-allow-list is not available"
           (advanced-config.models.pulse-channel/subscription-allowed-domains! "metabase.com"))))))
