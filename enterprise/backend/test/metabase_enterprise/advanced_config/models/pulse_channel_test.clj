(ns metabase-enterprise.advanced-config.models.pulse-channel-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.models :refer [Card Pulse PulseChannel]]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.pulse :as pulse]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest validate-email-domains-test
  (mt/with-temp Pulse [temp-pulse]
    (doseq [operation               [:create :update :send-email-now]
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
                          #(db/insert! PulseChannel
                             (merge (tt/with-temp-defaults PulseChannel)
                                    {:pulse_id (u/the-id temp-pulse), :details {:emails emails}}))

                          :update
                          #(mt/with-temp PulseChannel [{pulse-channel-id :id} {:pulse_id (u/the-id temp-pulse)}]
                             (db/update! PulseChannel pulse-channel-id, :details {:emails emails}))

                          :send-email-now
                          ;; "Send email now" uses actual card(s), but then has temp instances of the Pulse and
                          ;; PulseChannel (which will have :recipients filled in, not :details as for saved channels
                          ;; in other cases); each recipient in this case is just a map from :email to the email addr
                          ;; so this should simulate the same UI flow that happens for "Send email now"
                          #(mt/with-temp Card [card]
                             (let [temp-pc (assoc (tt/with-temp-defaults PulseChannel)
                                             :channel_type :email
                                             :recipients   (map (fn [email] {:email email}) emails)
                                             :enabled      true)
                                   temp-p  (assoc (tt/with-temp-defaults Pulse)
                                             :channels [temp-pc]
                                             :cards    [card])]
                               (pulse/send-pulse! temp-p) ; will throw exception on disallowed domains
                               true)))] ; return non-nil for assertion purposes, if no exception was thrown
              (if fail?
                (testing "should fail"
                  (is (thrown-with-msg?
                       clojure.lang.ExceptionInfo
                       #"You cannot create new subscriptions for the domain \"[\w@\.-]+\". Allowed domains are: .+"
                       (thunk))))
                (testing "should succeed"
                  (is (thunk)))))))))))
