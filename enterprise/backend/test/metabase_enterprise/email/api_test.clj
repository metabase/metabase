(ns metabase-enterprise.email.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.email :as email]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]))

(defn- email-override-settings  []
  {:email-smtp-host-override     (setting/get :email-smtp-host-override)
   :email-smtp-port-override     (setting/get :email-smtp-port-override)
   :email-smtp-security-override (setting/get :email-smtp-security-override)
   :email-smtp-username-override (setting/get :email-smtp-username-override)
   :email-smtp-password-override (setting/get :email-smtp-password-override)})

(def ^:private default-email-override-settings
  {:email-smtp-host-override     "foobar"
   :email-smtp-port-override     465
   :email-smtp-security-override :tls
   :email-smtp-username-override "munchkin"
   :email-smtp-password-override "gobble gobble"})

(deftest update-email-override-settings-test
  ;; There is a lot of overlap with the /api/email test, but enough differences that we keep them separate.
  ;; NOTE: When adding tests, ask yourself "should this also be tested in the /api/email test?"
  (testing "PUT /api/ee/email/override - check updating email settings"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (mt/with-premium-features [:cloud-custom-smtp]
        (testing "Cannot call without hosting"
          (is (= "API is not available on non-hosted servers."
                 (mt/user-http-request :crowberto :put 402 "ee/email/override" default-email-override-settings))))))
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (mt/with-premium-features []
        (testing "Cannot call without the :cloud-custom-smtp feature"
          (is (= "Custom SMTP is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (:message (mt/user-http-request :crowberto :put 402 "ee/email/override" default-email-override-settings))))))
      (mt/with-premium-features [:cloud-custom-smtp]
        (let [original-values (email-override-settings)
              body default-email-override-settings]
          (doseq [;; test what happens on both a successful and an unsuccessful connection.
                  [success? f] {true  (fn [thunk]
                                        (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                                          (thunk)))
                                false (fn [thunk]
                                        (with-redefs [email/retry-delay-ms 0]
                                          (thunk)))}]
            (tu/discard-setting-changes [email-smtp-host-override email-smtp-port-override email-smtp-security-override
                                         email-smtp-username-override email-smtp-password-override]
              (testing (format "SMTP connection is valid? %b\n" success?)
                (f (fn []
                     (testing "API request"
                       (testing (format "\nRequest body =\n%s" (u/pprint-to-str body))
                         (if success?
                           (is (= (-> default-email-override-settings
                                      (assoc :with-corrections {})
                                      (update :email-smtp-security-override name))
                                  (mt/user-http-request :crowberto :put 200 "ee/email/override" body)))
                           (is (= {:errors {:email-smtp-host-override "Wrong host or port"
                                            :email-smtp-port-override "Wrong host or port"}}
                                  (mt/user-http-request :crowberto :put 400 "ee/email/override" body))))))
                     (testing "Settings after API request is finished"
                       (is (= (if success?
                                default-email-override-settings
                                original-values)
                              (email-override-settings)))))))))))

      (mt/with-premium-features [:cloud-custom-smtp]
        (testing "Cannot use non-secure settings"
          (is (= "Invalid email-smtp-security-override value"
                 (mt/user-http-request :crowberto :put 400 "ee/email/override" (assoc default-email-override-settings :email-smtp-security-override "none"))))
          (is (= "Invalid email-smtp-port-override value"
                 (mt/user-http-request :crowberto :put 400 "ee/email/override" (assoc default-email-override-settings :email-smtp-port-override 25)))))
        (testing "Updating values with obfuscated password (#23919)"
          (mt/with-temporary-setting-values [email-smtp-host-override "www.test.com"
                                             email-smtp-password-override "preexisting"]
            (with-redefs [email/test-smtp-connection (fn [settings]
                                                       (let [obfuscated? (str/starts-with? (:pass settings) "****")]
                                                         (is (not obfuscated?) "We received an obfuscated password!")
                                                         (if obfuscated?
                                                           {::email/error (ex-info "Sent obfuscated password" {})}
                                                           settings)))]
              (testing "If we don't change the password we don't see the password"
                (let [payload (-> (email-override-settings)
                                ;; user changes one property
                                  (assoc :email-smtp-port 999)
                                ;; the FE will have an obfuscated value
                                  (update :email-smtp-password-override setting/obfuscate-value))
                      response (mt/user-http-request :crowberto :put 200 "ee/email/override" payload)]
                  (is (= (setting/obfuscate-value "preexisting") (:email-smtp-password-override response)))))
              (testing "If we change the password we can receive the password"
                (let [payload (-> (email-override-settings)
                                ;; user types in a new password
                                  (assoc :email-smtp-password-override "new-password"))
                      response (mt/user-http-request :crowberto :put 200 "ee/email/override" payload)]
                  (is (= "new-password" (:email-smtp-password-override response))))))))))))

(deftest clear-email-override-settings-test
  (testing "DELETE /api/ee/email/override"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (mt/with-premium-features [:cloud-custom-smtp]
        (testing "Cannot call without hosting"
          (is (= "API is not available on non-hosted servers."
                 (mt/user-http-request :crowberto :delete 402 "ee/email/override" default-email-override-settings))))))
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (mt/with-premium-features [:cloud-custom-smtp]
        (tu/discard-setting-changes [email-smtp-host-override email-smtp-port-override email-smtp-security-override
                                     email-smtp-username-override email-smtp-password-override]
          (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
            (is (= (-> default-email-override-settings
                       (assoc :with-corrections {})
                       (update :email-smtp-security-override name))
                   (mt/user-http-request :crowberto :put 200 "ee/email/override" default-email-override-settings)))
            (let [new-email-override-settings (email-override-settings)]
              (is (nil? (mt/user-http-request :crowberto :delete 204 "ee/email/override")))
              (is (= default-email-override-settings
                     new-email-override-settings))
              (is (= {:email-smtp-host-override     nil
                      :email-smtp-port-override     nil
                      :email-smtp-security-override :ssl
                      :email-smtp-username-override nil
                      :email-smtp-password-override nil}
                     (email-override-settings))))))))))
