(ns metabase.api.email-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api.email :as api.email]
   [metabase.email :as email]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]))

(deftest humanize-error-messages-test
  (is (= {:errors {:email-smtp-host "Wrong host or port", :email-smtp-port "Wrong host or port"}}
         (#'api.email/humanize-error-messages
          {::email/error (Exception. "Couldn't connect to host, port: foobar, 789; timeout 1000: foobar")})))
  (is (= {:message "Sorry, something went wrong. Please try again. Error: Some unexpected message"}
         (#'api.email/humanize-error-messages
          {::email/error (Exception. "Some unexpected message")})))
  (testing "Checks error classes for auth errors (#23918)"
    (let [exception (javax.mail.AuthenticationFailedException.
                     "" ;; Office365 returns auth exception with no message so we only saw "Read timed out" prior
                     (javax.mail.MessagingException.
                      "Exception reading response"
                      (java.net.SocketTimeoutException. "Read timed out")))]
      (is (= {:errors {:email-smtp-username "Wrong username or password"
                       :email-smtp-password "Wrong username or password"}}
             (#'api.email/humanize-error-messages {::email/error exception}))))))

(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (setting/get :email-smtp-password)
   :email-from-address  (setting/get :email-from-address)
   :email-from-name     (setting/get :email-from-name)
   :email-reply-to      (setting/get :email-reply-to)})

(def ^:private default-email-settings
  {:email-smtp-host     "foobar"
   :email-smtp-port     789
   :email-smtp-security :tls
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"
   :email-from-address  "eating@hungry.com"
   :email-from-name     "Eating"
   :email-reply-to      ["reply-to@hungry.com"]})

(deftest test-email-settings-test
  (testing "POST /api/email/test -- send a test email"
    (mt/with-temporary-setting-values [email-from-address "notifications@metabase.com"
                                       email-from-name    "Sender Name"
                                       email-reply-to     ["reply-to@metabase.com"]]
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
               @mt/inbox))))))

(deftest update-email-settings-test
  (testing "PUT /api/email - check updating email settings"
    ;; [[metabase.email/email-smtp-port]] was originally a string Setting (it predated our introduction of different
    ;; Settings types) -- make sure our API endpoints still work if you pass in the value as a String rather than an
    ;; integer.
    (let [original-values (email-settings)]
      (doseq [body         [default-email-settings
                            (update default-email-settings :email-smtp-port str)]
              ;; test what happens on both a successful and an unsuccessful connection.
              [success? f] {true  (fn [thunk]
                                    (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                                      (thunk)))
                            false (fn [thunk]
                                    (with-redefs [email/retry-delay-ms 0]
                                      (thunk)))}]
        (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                     email-smtp-password email-from-address email-from-name email-reply-to]
          (testing (format "SMTP connection is valid? %b\n" success?)
            (f (fn []
                 (testing "API request"
                   (testing (format "\nRequest body =\n%s" (u/pprint-to-str body))
                     (if success?
                       (is (= (-> default-email-settings
                                  (assoc :with-corrections {})
                                  (update :email-smtp-security name))
                              (mt/user-http-request :crowberto :put 200 "email" body)))
                       (is (= {:errors {:email-smtp-host "Wrong host or port"
                                        :email-smtp-port "Wrong host or port"}}
                              (mt/user-http-request :crowberto :put 400 "email" body))))))
                 (testing "Settings after API request is finished"
                   (is (= (if success?
                            default-email-settings
                            original-values)
                          (email-settings)))))))))
      (testing (format "SMTP connection is still valid when some settings are not specified, but set with env vars")
        (let [body (dissoc default-email-settings
                           :email-smtp-port
                           :email-smtp-host
                           :email-smtp-security
                           :email-smtp-username
                           :email-smtp-password
                           :email-from-address)]
          (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                       email-smtp-password email-from-address email-from-name email-reply-to]
            (mt/with-temp-env-var-value! [mb-email-smtp-port     (:email-smtp-port default-email-settings)
                                          mb-email-smtp-host     (:email-smtp-host default-email-settings)
                                          mb-email-smtp-security (name (:email-smtp-security default-email-settings))
                                          mb-email-smtp-username (:email-smtp-username default-email-settings)
                                          mb-email-smtp-password (:email-smtp-password default-email-settings)
                                          mb-email-from-address  (:email-from-address default-email-settings)]
              (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                (testing "API request"
                  (is (= (-> default-email-settings
                             (assoc :with-corrections {})
                             (update :email-smtp-security name))
                         (mt/user-http-request :crowberto :put 200 "email" body))))
                (testing "Settings after API request is finished"
                  (is (= default-email-settings
                         (email-settings)))))))))))
  (testing "Updating values with obfuscated password (#23919)"
    (mt/with-temporary-setting-values [email-from-address  "notifications@metabase.com"
                                       email-from-name     "Sender Name"
                                       email-reply-to      ["reply-to@metabase.com"]
                                       email-smtp-host     "www.test.com"
                                       email-smtp-password "preexisting"]
      (with-redefs [email/test-smtp-connection (fn [settings]
                                                 (let [obfuscated? (str/starts-with? (:pass settings) "****")]
                                                   (is (not obfuscated?) "We received an obfuscated password!")
                                                   (if obfuscated?
                                                     {::email/error (ex-info "Sent obfuscated password" {})}
                                                     settings)))]
        (testing "If we don't change the password we don't see the password"
          (let [payload  (-> (email-settings)
                             ;; user changes one property
                             (assoc :email-from-name "notifications")
                             ;; the FE will have an obfuscated value
                             (update :email-smtp-password setting/obfuscate-value))
                response (mt/user-http-request :crowberto :put 200 "email" payload)]
            (is (= (setting/obfuscate-value "preexisting") (:email-smtp-password response)))))
        (testing "If we change the password we can receive the password"
          (let [payload  (-> (email-settings)
                             ;; user types in a new password
                             (assoc :email-smtp-password "new-password"))
                response (mt/user-http-request :crowberto :put 200 "email" payload)]
            (is (= "new-password" (:email-smtp-password response)))))))))

(deftest clear-email-settings-test
  (testing "DELETE /api/email"
    (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                 email-smtp-password email-from-address email-from-name email-reply-to]
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
                  :email-smtp-password nil
                  :email-from-address  "notifications@metabase.com"
                  :email-from-name     nil
                  :email-reply-to      nil}
                 (email-settings))))))))
