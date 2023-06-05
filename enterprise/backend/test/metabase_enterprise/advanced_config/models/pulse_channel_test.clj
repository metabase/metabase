(ns metabase-enterprise.advanced-config.models.pulse-channel-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.models :refer [Pulse PulseChannel]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan.util.test :as tt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest validate-email-domains-test
  (t2.with-temp/with-temp [Pulse {pulse-id :id}]
    (doseq [operation               [:create :update]
            enable-advanced-config? [true false]
            allowed-domains         [nil
                                     #{"metabase.com"}
                                     #{"metabase.com" "toucan.farm"}]
            emails                  [nil
                                     ["cam@metabase.com"]
                                     ["cam@metabase.com" "cam@toucan.farm"]
                                     ["cam@metabase.com" "cam@disallowed-domain.com"]]
            :let                    [fail? (and enable-advanced-config?
                                                allowed-domains
                                                (not (every? (fn [email]
                                                               (contains? allowed-domains (u/email->domain email)))
                                                             emails)))]]
      (premium-features-test/with-premium-features (if enable-advanced-config?
                                                     #{:advanced-config}
                                                     #{})
        (mt/with-temporary-setting-values [subscription-allowed-domains (str/join "," allowed-domains)]
          ;; `with-premium-features` and `with-temporary-setting-values` will add `testing` context for the other
          ;; stuff.
          (testing (str (format "\nOperation = %s" operation)
                        (format "\nEmails = %s" (pr-str emails)))
            (let [thunk (case operation
                          :create
                          #(first (t2/insert-returning-instances! PulseChannel
                                                                  (merge (tt/with-temp-defaults PulseChannel)
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
