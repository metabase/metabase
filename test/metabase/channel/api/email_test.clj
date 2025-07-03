(ns metabase.channel.api.email-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.channel.api.email :as api.email]
   [metabase.channel.email :as email]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]))

(deftest humanize-error-messages-test
  (testing "host and port"
    (is (= {:errors {:email-smtp-host "Wrong host or port", :email-smtp-port "Wrong host or port"}}
           (#'api.email/humanize-error-messages @#'api.email/mb-to-smtp-settings
                                                {::email/error (Exception. "Couldn't connect to host, port: foobar, 789; timeout 1000: foobar")})))
    (is (= {:errors {:email-smtp-host-override "Wrong host or port", :email-smtp-port-override "Wrong host or port"}}
           (#'api.email/humanize-error-messages @#'api.email/mb-to-smtp-override-settings
                                                {::email/error (Exception. "Couldn't connect to host, port: foobar, 789; timeout 1000: foobar")}))))
  (is (= {:message "Sorry, something went wrong. Please try again. Error: Some unexpected message"}
         (#'api.email/humanize-error-messages @#'api.email/mb-to-smtp-settings
                                              {::email/error (Exception. "Some unexpected message")})))
  (testing "Checks error classes for auth errors (#23918)"
    (let [exception (javax.mail.AuthenticationFailedException.
                     "" ;; Office365 returns auth exception with no message so we only saw "Read timed out" prior
                     (javax.mail.MessagingException.
                      "Exception reading response"
                      (java.net.SocketTimeoutException. "Read timed out")))]
      (is (= {:errors {:email-smtp-username "Wrong username or password"
                       :email-smtp-password "Wrong username or password"}}
             (#'api.email/humanize-error-messages @#'api.email/mb-to-smtp-settings {::email/error exception})))
      (is (= {:errors {:email-smtp-username-override "Wrong username or password"
                       :email-smtp-password-override "Wrong username or password"}}
             (#'api.email/humanize-error-messages @#'api.email/mb-to-smtp-override-settings {::email/error exception}))))))

(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (setting/get :email-smtp-password)})

(defn- email-override-settings  []
  {:email-smtp-host-override     (setting/get :email-smtp-host-override)
   :email-smtp-port-override     (setting/get :email-smtp-port-override)
   :email-smtp-security-override (setting/get :email-smtp-security-override)
   :email-smtp-username-override (setting/get :email-smtp-username-override)
   :email-smtp-password-override (setting/get :email-smtp-password-override)})

(def ^:private default-email-settings
  {:email-smtp-host     "foobar"
   :email-smtp-port     789
   :email-smtp-security :tls
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"})

(def ^:private default-email-override-settings
  {:email-smtp-host-override     "foobar"
   :email-smtp-port-override     465
   :email-smtp-security-override :tls
   :email-smtp-username-override "munchkin"
   :email-smtp-password-override "gobble gobble"})

(deftest test-email-settings-test
  (testing "POST /api/email/test -- send a test email"
    (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST nil
                                  MB_EMAIL_SMTP_PORT nil
                                  MB_EMAIL_SMTP_SECURITY nil
                                  MB_EMAIL_SMTP_USERNAME nil
                                  MB_EMAIL_SMTP_PASSWORD nil]
      (mt/with-temporary-setting-values [email-from-address "notifications@metabase.com"
                                         email-from-name "Sender Name"
                                         email-reply-to ["reply-to@metabase.com"]]
        (mt/with-fake-inbox
          (testing "Non-admin -- request should fail"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "email/test")))
            (is (= {}
                   @mt/inbox)))
          (is (= {:ok true}
                 (mt/user-http-request :crowberto :post 200 "email/test")))
          (is (= {"crowberto@metabase.com"
                  [{:from     "Sender Name <notifications@metabase.com>",
                    :to       ["crowberto@metabase.com"],
                    :reply-to ["reply-to@metabase.com"]
                    :subject  "Metabase Test Email",
                    :body     "Your Metabase emails are working — hooray!"}]}
                 @mt/inbox)))))))

(deftest update-email-settings-test
  ;; There is a lot of overlap with the /api/email/override test, but enough differences that we keep them separate.
  ;; NOTE: When adding tests, ask yourself "should this also be tested in the /api/email/override test?"
  (testing "PUT /api/email - check updating email settings"
    ;(mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST nil
    ;                              MB_EMAIL_SMTP_PORT nil
    ;                              MB_EMAIL_SMTP_SECURITY nil
    ;                              MB_EMAIL_SMTP_USERNAME nil
    ;                              MB_EMAIL_SMTP_PASSWORD nil]
    ;  ;; [[metabase.channel.email/email-smtp-port]] was originally a string Setting (it predated our introduction of different
    ;  ;; Settings types) -- make sure our API endpoints still work if you pass in the value as a String rather than an
    ;  ;; integer.
    ;  (let [original-values (email-settings)]
    ;    (doseq [body [default-email-settings
    ;                  (update default-email-settings :email-smtp-port str)]
    ;            ;; test what happens on both a successful and an unsuccessful connection.
    ;            [success? f] {true  (fn [thunk]
    ;                                  (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
    ;                                    (thunk)))
    ;                          false (fn [thunk]
    ;                                  (with-redefs [email/retry-delay-ms 0]
    ;                                    (thunk)))}]
    ;      (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username email-smtp-password]
    ;        (testing (format "SMTP connection is valid? %b\n" success?)
    ;          (f (fn []
    ;               (testing "API request"
    ;                 (testing (format "\nRequest body =\n%s" (u/pprint-to-str body))
    ;                   (if success?
    ;                     (is (= (-> default-email-settings
    ;                              (assoc :with-corrections {})
    ;                              (update :email-smtp-security name))
    ;                           (mt/user-http-request :crowberto :put 200 "email" body)))
    ;                     (is (= {:errors {:email-smtp-host "Wrong host or port"
    ;                                      :email-smtp-port "Wrong host or port"}}
    ;                           (mt/user-http-request :crowberto :put 400 "email" body)))))
    ;                 (testing "Settings after API request is finished"
    ;                   (is (= (if success?
    ;                            default-email-settings
    ;                            original-values)
    ;                         (email-settings))))))))))))
    ;(testing "Updating values with obfuscated password (#23919)"
    ;  (mt/with-temporary-setting-values [email-smtp-host "www.test.com"
    ;                                     email-smtp-password "preexisting"]
    ;    (with-redefs [email/test-smtp-connection (fn [settings]
    ;                                               (let [obfuscated? (str/starts-with? (:pass settings) "****")]
    ;                                                 (is (not obfuscated?) "We received an obfuscated password!")
    ;                                                 (if obfuscated?
    ;                                                   {::email/error (ex-info "Sent obfuscated password" {})}
    ;                                                   settings)))]
    ;      (testing "If we don't change the password we don't see the password"
    ;        (let [payload (-> (email-settings)
    ;                        ;; user changes one property
    ;                        (assoc :email-smtp-port 999)
    ;                        ;; the FE will have an obfuscated value
    ;                        (update :email-smtp-password setting/obfuscate-value))
    ;              response (mt/user-http-request :crowberto :put 200 "email" payload)]
    ;          (is (= (setting/obfuscate-value "preexisting") (:email-smtp-password response)))))
    ;      (testing "If we change the password we can receive the password"
    ;        (let [payload (-> (email-settings)
    ;                        ;; user types in a new password
    ;                        (assoc :email-smtp-password "new-password"))
    ;              response (mt/user-http-request :crowberto :put 200 "email" payload)]
    ;          (is (= "new-password" (:email-smtp-password response))))))))
    (testing "If values are not sent, they are cleared"
      (mt/with-temporary-setting-values [email-smtp-host "www.test.com"
                                         email-smtp-port "123"
                                         email-smtp-username "pre-user"
                                         email-smtp-password "pre-pass"]
        (with-redefs [email/test-smtp-connection (fn [settings] settings)]
          (is (= "pre-user" (setting/get-value-of-type :string :email-smtp-username)))
          (is (= "pre-pass" (setting/get-value-of-type :string :email-smtp-password)))
          (is (= 123 (setting/get-value-of-type :integer :email-smtp-port)))
          (let [payload (-> (email-settings)
                            ;; Don't send some values
                            (dissoc :email-smtp-username)
                            (dissoc :email-smtp-password))
                response (mt/user-http-request :crowberto :put 200 "email" payload)]
            (is (nil? (:email-smtp-username response)))
            (is (nil? (:email-smtp-password response)))
            (is (= 123 (:email-smtp-port response)))

            (is (nil? (setting/get-value-of-type :string :email-smtp-username)))
            (is (nil? (setting/get-value-of-type :string :email-smtp-password)))
            (is (= 123 (setting/get-value-of-type :integer :email-smtp-port)))))))))

(deftest update-email-override-settings-test
  ;; There is a lot of overlap with the /api/email test, but enough differences that we keep them separate.
  ;; NOTE: When adding tests, ask yourself "should this also be tested in the /api/email test?"
  (testing "PUT /api/email/override - check updating email settings"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (testing "Cannot call without hosting"
        (is (= "API is not available on non-hosted servers."
               (mt/user-http-request :crowberto :put 403 "email/override" default-email-override-settings)))))
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (mt/with-premium-features []
        (testing "Cannot call without the :cloud-custom-smtp feature"
          (is (= "API is not available in your Metabase plan. Please upgrade to use this feature."
                 (mt/user-http-request :crowberto :put 403 "email/override" default-email-override-settings)))))
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
                                  (mt/user-http-request :crowberto :put 200 "email/override" body)))
                           (is (= {:errors {:email-smtp-host-override "Wrong host or port"
                                            :email-smtp-port-override "Wrong host or port"}}
                                  (mt/user-http-request :crowberto :put 400 "email/override" body))))))
                     (testing "Settings after API request is finished"
                       (is (= (if success?
                                default-email-override-settings
                                original-values)
                              (email-override-settings)))))))))))

      (mt/with-premium-features [:cloud-custom-smtp]
        (testing "Cannot use non-secure settings"
          (is (= "Invalid email-smtp-security-override value"
                 (mt/user-http-request :crowberto :put 400 "email/override" (assoc default-email-override-settings :email-smtp-security-override "none"))))
          (is (= "Invalid email-smtp-port-override value"
                 (mt/user-http-request :crowberto :put 400 "email/override" (assoc default-email-override-settings :email-smtp-port-override 25)))))
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
                      response (mt/user-http-request :crowberto :put 200 "email/override" payload)]
                  (is (= (setting/obfuscate-value "preexisting") (:email-smtp-password-override response)))))
              (testing "If we change the password we can receive the password"
                (let [payload (-> (email-override-settings)
                                ;; user types in a new password
                                  (assoc :email-smtp-password-override "new-password"))
                      response (mt/user-http-request :crowberto :put 200 "email/override" payload)]
                  (is (= "new-password" (:email-smtp-password-override response))))))))))))

(deftest clear-email-settings-test
  (testing "DELETE /api/email"
    (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST     nil
                                  MB_EMAIL_SMTP_PORT  nil
                                  MB_EMAIL_SMTP_SECURITY nil
                                  MB_EMAIL_SMTP_USERNAME nil
                                  MB_EMAIL_SMTP_PASSWORD nil]
      (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username email-smtp-password]
        (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
          (is (= (-> default-email-settings
                     (assoc :with-corrections {})
                     (update :email-smtp-security name))
                 (mt/user-http-request :crowberto :put 200 "email" default-email-settings)))
          (let [new-email-settings (email-settings)]
            (is (nil? (mt/user-http-request :crowberto :delete 204 "email")))
            (is (= default-email-settings
                   new-email-settings))
            (is (= {:email-smtp-host     nil
                    :email-smtp-port     nil
                    :email-smtp-security :none
                    :email-smtp-username nil
                    :email-smtp-password nil}
                   (email-settings)))))))))

(deftest clear-email-override-settings-test
  (testing "DELETE /api/email/override"
    (with-redefs [premium-features/is-hosted? (constantly false)]
      (testing "Cannot call without hosting"
        (is (= "API is not available on non-hosted servers."
               (mt/user-http-request :crowberto :delete 403 "email/override" default-email-override-settings)))))
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (mt/with-premium-features [:cloud-custom-smtp]
        (tu/discard-setting-changes [email-smtp-host-override email-smtp-port-override email-smtp-security-override
                                     email-smtp-username-override email-smtp-password-override]
          (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
            (is (= (-> default-email-override-settings
                       (assoc :with-corrections {})
                       (update :email-smtp-security-override name))
                   (mt/user-http-request :crowberto :put 200 "email/override" default-email-override-settings)))
            (let [new-email-override-settings (email-override-settings)]
              (is (nil? (mt/user-http-request :crowberto :delete 204 "email/override")))
              (is (= default-email-override-settings
                     new-email-override-settings))
              (is (= {:email-smtp-host-override     nil
                      :email-smtp-port-override     nil
                      :email-smtp-security-override :ssl
                      :email-smtp-username-override nil
                      :email-smtp-password-override nil}
                     (email-override-settings))))))))))
