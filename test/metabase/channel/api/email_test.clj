(ns metabase.channel.api.email-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.email :as email]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.test.util :as tu]))

(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (mt/plaintext (setting/get :email-smtp-password))})

(def ^:private default-email-settings
  {:email-smtp-host     "foobar"
   :email-smtp-port     789
   :email-smtp-security :tls
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"})

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
        (mt/with-dynamic-fn-redefs [email/test-smtp-connection (fn [settings] settings)]
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

(deftest clear-email-settings-test
  (testing "DELETE /api/email"
    (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST     nil
                                  MB_EMAIL_SMTP_PORT  nil
                                  MB_EMAIL_SMTP_SECURITY nil
                                  MB_EMAIL_SMTP_USERNAME nil
                                  MB_EMAIL_SMTP_PASSWORD nil]
      (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username email-smtp-password]
        (mt/with-dynamic-fn-redefs [email/test-smtp-settings (constantly {::email/error nil})]
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

(deftest endpoints-require-authentication-test
  ;; +auth must reject before the handler's :setting permission check, so anon callers
  ;; get 401 rather than 403.
  (testing "/api/email endpoints reject unauthenticated callers"
    (testing "PUT /api/email"
      (is (= "Unauthenticated"
             (mt/client :put 401 "email" default-email-settings))))
    (testing "DELETE /api/email"
      (is (= "Unauthenticated"
             (mt/client :delete 401 "email"))))
    (testing "POST /api/email/test"
      (is (= "Unauthenticated"
             (mt/client :post 401 "email/test"))))))

(deftest smtp-host-change-requires-the-password-again-test
  (testing "moving the SMTP server, or weakening the channel to it, while the stored password would be reused is
           refused (SEC: credential redirection). The refusal lands before test-smtp-connection, which is what would
           otherwise have delivered the password to the new server."
    (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST nil
                                  MB_EMAIL_SMTP_PORT nil
                                  MB_EMAIL_SMTP_SECURITY nil
                                  MB_EMAIL_SMTP_USERNAME nil
                                  MB_EMAIL_SMTP_PASSWORD nil]
      (tu/with-temporary-setting-values [email-smtp-host     "smtp.example.com"
                                         email-smtp-port     587
                                         email-smtp-security :starttls
                                         email-smtp-username "mb"
                                         email-smtp-password "smtp-secret"]
        (let [attempted (atom [])]
          (mt/with-dynamic-fn-redefs [email/test-smtp-settings (fn [settings]
                                                                 (swap! attempted conj settings)
                                                                 {::email/error nil})]
            (testing "a new host with the mask echoed back"
              (let [resp (mt/user-http-request :crowberto :put 400 "email"
                                               {:email-smtp-host     "evil.example.com"
                                                :email-smtp-port     587
                                                :email-smtp-security :starttls
                                                :email-smtp-username "mb"
                                                :email-smtp-password (setting/obfuscate-value "smtp-secret")})]
                (is (= "secret-audience-mismatch" (:error-code resp)))
                (is (= [] @attempted) "no SMTP connection was attempted, so the password never left")))
            (testing "the downgrade case: same host, plaintext channel"
              (reset! attempted [])
              (let [resp (mt/user-http-request :crowberto :put 400 "email"
                                               {:email-smtp-host     "smtp.example.com"
                                                :email-smtp-port     25
                                                :email-smtp-security :none
                                                :email-smtp-username "mb"
                                                :email-smtp-password (setting/obfuscate-value "smtp-secret")})]
                (is (= "secret-audience-mismatch" (:error-code resp)))
                (is (= [] @attempted))))
            (testing "the stored password is untouched"
              (is (= "smtp-secret" (mt/plaintext (setting/get :email-smtp-password))))
              (is (= "smtp.example.com" (setting/get :email-smtp-host))))
            (testing "a freshly supplied password authorizes the move"
              (reset! attempted [])
              (mt/user-http-request :crowberto :put 200 "email"
                                    {:email-smtp-host     "new.example.com"
                                     :email-smtp-port     587
                                     :email-smtp-security :starttls
                                     :email-smtp-username "mb"
                                     :email-smtp-password "brand-new"})
              (is (= 1 (count @attempted)))
              (is (= "brand-new" (:pass (first @attempted))))
              (is (= "new.example.com" (setting/get :email-smtp-host)))
              (is (= "brand-new" (mt/plaintext (setting/get :email-smtp-password)))))))))))

(deftest stored-password-is-only-tried-on-its-own-channel-test
  (testing "when the stored password is reused, a failed connection is not retried over other security options: the
           credential was saved for one channel and may not be sent over another. A freshly typed password may be."
    (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST nil
                                  MB_EMAIL_SMTP_PORT nil
                                  MB_EMAIL_SMTP_SECURITY nil
                                  MB_EMAIL_SMTP_USERNAME nil
                                  MB_EMAIL_SMTP_PASSWORD nil]
      (tu/with-temporary-setting-values [email-smtp-host     "smtp.example.com"
                                         email-smtp-port     587
                                         email-smtp-security :starttls
                                         email-smtp-username "mb"
                                         email-smtp-password "smtp-secret"]
        (let [attempted (atom [])
              settings  {:email-smtp-host     "smtp.example.com"
                         :email-smtp-port     587
                         :email-smtp-security :starttls
                         :email-smtp-username "mb"}]
          ;; `retry-delay-ms` is a def, not a fn, so it stays on `with-redefs`
          (with-redefs [email/retry-delay-ms 0]
            (mt/with-dynamic-fn-redefs [email/test-smtp-settings (fn [details]
                                                                   (swap! attempted conj details)
                                                                   {::email/error (ex-info "refused" {})})]
              (testing "the stored password: one attempt, on the bound channel"
                (mt/user-http-request :crowberto :put 400 "email"
                                      (assoc settings :email-smtp-password (setting/obfuscate-value "smtp-secret")))
                (is (= [:starttls] (map :security @attempted))))
              (testing "a fresh password: the usual guessing across channels"
                (reset! attempted [])
                (mt/user-http-request :crowberto :put 400 "email"
                                      (assoc settings :email-smtp-password "brand-new"))
                (is (< 1 (count @attempted)))))))))))

(deftest echoed-mask-does-not-rewrite-the-stored-password-test
  (testing "reusing the stored password writes nothing: the endpoint never holds the plaintext, so there is nothing to
           write back, and the audit log does not record a change that did not happen"
    (mt/with-premium-features #{:audit-app}
      (mt/with-temp-env-var-value! [MB_EMAIL_SMTP_HOST nil
                                    MB_EMAIL_SMTP_PORT nil
                                    MB_EMAIL_SMTP_SECURITY nil
                                    MB_EMAIL_SMTP_USERNAME nil
                                    MB_EMAIL_SMTP_PASSWORD nil]
        (tu/with-temporary-setting-values [email-smtp-host     "smtp.example.com"
                                           email-smtp-port     587
                                           email-smtp-security :starttls
                                           email-smtp-username "mb"
                                           email-smtp-password "smtp-secret"]
          (mt/with-dynamic-fn-redefs [email/test-smtp-settings (constantly {::email/error nil})]
            (let [before (mt/setting-update-audit-event-count "email-smtp-password")
                  resp   (mt/user-http-request :crowberto :put 200 "email"
                                               {:email-smtp-host     "smtp.example.com"
                                                :email-smtp-port     587
                                                :email-smtp-security :starttls
                                                :email-smtp-username "mb"
                                                :email-smtp-password (setting/obfuscate-value "smtp-secret")})]
              (is (= (setting/obfuscate-value "smtp-secret") (:email-smtp-password resp)))
              (is (= before (mt/setting-update-audit-event-count "email-smtp-password")))
              (is (= "smtp-secret" (mt/plaintext (setting/get :email-smtp-password)))))))))))
