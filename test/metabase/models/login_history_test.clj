(ns metabase.models.login-history-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [java-time :as t]
            [metabase.models :refer [LoginHistory User]]
            [metabase.models.login-history :as login-history]
            [metabase.server.request.util :as request.u]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(deftest first-login-on-this-device?-test
  (let [device-1 (str (java.util.UUID/randomUUID))
        device-2 (str (java.util.UUID/randomUUID))]
    (mt/with-temp* [User         [{user-id :id}]
                    LoginHistory [history-1 {:user_id user-id, :device_id device-1}]]
      (testing "one login to device 1 -- should be the first login with this device"
        (is (= true
               (#'login-history/first-login-on-this-device? history-1)))
        (is (= true
               (#'login-history/first-login-ever? history-1))))
      (testing "add a history item for a *different* device -- should be the first login with this device"
        (mt/with-temp LoginHistory [history-2 {:user_id user-id, :device_id device-2}]
          (is (= true
                 (#'login-history/first-login-on-this-device? history-1)))
          (is (= false
                 (#'login-history/first-login-ever? history-1)))
          (testing "add a second history item for device 1 -- should *not* be the first login with this device"
            (mt/with-temp LoginHistory [history-2 {:user_id user-id, :device_id device-1}]
              (is (= false
                     (#'login-history/first-login-on-this-device? history-1)))
              (is (= false
                 (#'login-history/first-login-ever? history-1))))))))))

(deftest send-email-on-first-login-from-new-device-test
  (testing "User should get an email the first time they log in from a new device (#14313, #15603)"
    (mt/with-temp User [{user-id :id, email :email, first-name :first_name}]
      (let [device              (str (java.util.UUID/randomUUID))
            original-maybe-send (var-get #'login-history/maybe-send-login-from-new-device-email)]
        (testing "send email on first login from *new* device (but not first login ever)"
          (mt/with-fake-inbox
            ;; mock out the IP address geocoding function so we can make sure it handles timezones like PST correctly
            ;; (#15603)
            (with-redefs [request.u/geocode-ip-addresses (fn [ip-addresses]
                                                           (into {} (for [ip-address ip-addresses]
                                                                      [ip-address
                                                                       {:description "San Francisco, California, United States"
                                                                        :timezone    (t/zone-id "America/Los_Angeles")}])))
                          login-history/maybe-send-login-from-new-device-email
                          (fn [login-history]
                            (when-let [futur (original-maybe-send login-history)]
                              ;; block in tests
                              (u/deref-with-timeout futur 10000)))]
              (mt/with-temp* [LoginHistory [_ {:user_id   user-id
                                               :device_id (str (java.util.UUID/randomUUID))}]
                              LoginHistory [_ {:user_id   user-id
                                               :device_id device
                                               :timestamp #t "2021-04-02T15:52:00-07:00[US/Pacific]"}]]

                (is (schema= {(s/eq email)
                              [{:from    su/Email
                                :to      (s/eq [email])
                                :subject (s/eq (format "We've Noticed a New Metabase Login, %s" first-name))
                                :body    [(s/one {:type    (s/eq "text/html; charset=utf-8")
                                                  :content s/Str}
                                                 "HTML body")]}]}
                             @mt/inbox))
                (let [message (-> @mt/inbox (get email) first :body first :content)]
                  (testing (format "\nMessage = %s" (pr-str message))
                    (is (string? message))
                    (when (string? message)
                      (doseq [expected-str ["We've noticed a new login on your Metabase account."
                                            "We noticed a login on your Metabase account from a new device."
                                            "Browser (Chrome/Windows) - San Francisco, California, United States"
                                            ;; `format-human-readable` has slightly different output on different JVMs
                                            (u.date/format-human-readable #t "2021-04-02T15:52:00-07:00[US/Pacific]")]]
                        (is (str/includes? message expected-str))))))

                (testing "don't send email on subsequent login from same device"
                  (mt/reset-inbox!)
                  (mt/with-temp LoginHistory [_ {:user_id user-id, :device_id device}]
                    (is (= {}
                           @mt/inbox)))))))))))

  (testing "don't send email if the setting is disabled by setting MB_SEND_EMAIL_ON_FIRST_LOGIN_FROM_NEW_DEVICE=FALSE"
    (mt/with-temp User [{user-id :id, email :email, first-name :first_name}]
      (mt/with-fake-inbox
        ;; can't use `mt/with-temporary-setting-values` here because it's a read-only setting
        (mt/with-temp-env-var-value [mb-send-email-on-first-login-from-new-device "FALSE"]
          (mt/with-temp* [LoginHistory [_ {:user_id user-id, :device_id (str (java.util.UUID/randomUUID))}]
                          LoginHistory [_ {:user_id user-id, :device_id (str (java.util.UUID/randomUUID))}]]
            (is (= {}
                   @mt/inbox))))))))
