(ns metabase-enterprise.advanced-config.models.notification-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
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
                             (t2/update! :model/PulseChannel pulse-channel-id {:details {:emails emails}})))]
              (if fail?
                (testing "should fail"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"The following email addresses are not allowed: .*"
                       (thunk))))
                (testing "should succeed"
                  (is (thunk)))))))))))
