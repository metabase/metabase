(ns metabase.api.email-test
  (:require [clojure.test :refer :all]
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
          {::email/error (Exception. "Some unexpected message")}))))

(defn- email-settings
  []
  {:email-smtp-host     (setting/get :email-smtp-host)
   :email-smtp-port     (setting/get :email-smtp-port)
   :email-smtp-security (setting/get :email-smtp-security)
   :email-smtp-username (setting/get :email-smtp-username)
   :email-smtp-password (setting/get :email-smtp-password)
   :email-from-address  (setting/get :email-from-address)})

(def ^:private default-email-settings
  {:email-smtp-host     "foobar"
   :email-smtp-port     789
   :email-smtp-security :tls
   :email-smtp-username "munchkin"
   :email-smtp-password "gobble gobble"
   :email-from-address  "eating@hungry.com"})

;; PUT /api/email - check updating email settings
(deftest update-email-settings-test
  (testing "PUT /api/email"
    ;; [[metabase.email/email-smtp-port]] was originally a string Setting (it predated our introduction of different
    ;; Settings types) -- make sure our API endpoints still work if you pass in the value as a String rather than an
    ;; integer.
    (testing "Make sure endpoint works with port passed in as"
      (doseq [[message body] {"an integer" default-email-settings
                              "a string"   (update default-email-settings :email-smtp-port str)}]
        (testing message
          (let [original-values (email-settings)]
            ;; test what happens on both a successful and an unsuccessful connection.
            (doseq [[success? f] {true  (fn [thunk]
                                          (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                                            (thunk)))
                                  false (fn [f]
                                          (with-redefs [email/retry-delay-ms 0]
                                            (f)))}]
              (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                           email-smtp-password email-from-address]
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
                                (email-settings)))))))))))))))

(deftest clear-email-settings-test
  (testing "DELETE /api/email"
    (tu/discard-setting-changes [email-smtp-host email-smtp-port email-smtp-security email-smtp-username
                                 email-smtp-password email-from-address]
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
                  :email-from-address  "notifications@metabase.com"}
                 (email-settings))))))))
