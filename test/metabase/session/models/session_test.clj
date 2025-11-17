(ns metabase.session.models.session-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.login-history.record]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")
(def ^:private test-id "abcde12345")

;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
;; the way we'd expect :/
(defn- new-session! []
  (let [session-id test-id]
    (try
      (t2/insert-returning-instance! :model/Session {:id session-id :key_hashed (session/hash-session-key (str test-uuid)), :user_id (mt/user->id :trashbird)})
      (finally
        (t2/delete! :model/Session :id test-id)))))

(deftest new-session-include-test-test
  (testing "when creating a new Session, it should come back without an anti_csrf_token"
    (is (=? {:id              test-id
             :key_hashed      (session/hash-session-key "092797dd-a82a-4748-b393-697d7bb9ab65")
             :user_id         (mt/user->id :trashbird)
             :anti_csrf_token nil}
            (new-session!)))))

(deftest embedding-test
  (testing "if request is an embedding request, we should set the anti_csrf_token"
    (request/with-current-request {:headers {"x-metabase-embedded" "true"}}
      (with-redefs [session/random-anti-csrf-token (constantly "315c1279c6f9f873bf1face7afeee420")]
        (is (=? {:id              test-id
                 :key_hashed      (session/hash-session-key "092797dd-a82a-4748-b393-697d7bb9ab65")
                 :user_id         (mt/user->id :trashbird)
                 :anti_csrf_token "315c1279c6f9f873bf1face7afeee420"}
                (new-session!)))))))

(deftest send-email-on-first-login-from-new-device-test
  (testing "User should get an email the first time they log in from a new device (#14313, #15603, #17495)"
    (mt/test-helpers-set-global-values!
      (mt/with-temp [:model/User {user-id :id, email :email, first-name :first_name}]
        (let [device              (str (random-uuid))
              original-maybe-send (var-get #'metabase.login-history.record/maybe-send-login-from-new-device-email)]
          (testing "send email on first login from *new* device (but not first login ever)"
            (mt/with-fake-inbox
              ;; mock out the IP address geocoding function so we can make sure it handles timezones like PST correctly
              ;; (#15603)
              (with-redefs [request/geocode-ip-addresses (fn [ip-addresses]
                                                           (into {} (for [ip-address ip-addresses]
                                                                      [ip-address
                                                                       {:description "San Francisco, California, United States"
                                                                        :timezone    (t/zone-id "America/Los_Angeles")}])))
                            metabase.login-history.record/maybe-send-login-from-new-device-email
                            (fn [login-history]
                              (when-let [futur (original-maybe-send login-history)]
                                ;; block in tests
                                (u/deref-with-timeout futur 10000)))]
                (mt/with-temp [:model/LoginHistory _ {:user_id   user-id
                                                      :device_id (str (random-uuid))}
                               :model/LoginHistory _ {:user_id   user-id
                                                      :device_id device
                                                      :timestamp #t "2021-04-02T15:52:00-07:00[US/Pacific]"}]
                  (#'metabase.login-history.record/maybe-send-login-from-new-device-email
                   {:user_id user-id
                    :device_id device
                    :timestamp #t "2021-04-02T15:52:00-07:00[US/Pacific]"
                    :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"})

                  (is (malli= [:sequential {:min 1}
                               [:map {:closed true}
                                [:from ms/Email]
                                [:to [:= [email]]]
                                [:subject [:= (format "We've Noticed a New Metabase Login, %s" first-name)]]
                                [:body [:sequential [:map
                                                     [:type [:= "text/html; charset=utf-8"]]
                                                     [:content :string]]]]]]
                              (get @mt/inbox email)))
                  (let [message  (-> @mt/inbox (get email) first :body first :content)
                        site-url (system/site-url)]
                    (testing (format "\nMessage = %s\nsite-url = %s" (pr-str message) (pr-str site-url))
                      (is (string? message))
                      (when (string? message)
                        (doseq [expected-str [(format "We've noticed a new login on your <a href=\"%s\">Metabase</a> account."
                                                      (or site-url ""))
                                              (format "We noticed a login on your <a href=\"%s\">Metabase</a> account from a new device."
                                                      (or site-url ""))
                                              "Browser (Chrome/Windows) - San Francisco, California, United States"
                                              ;; `format-human-readable` has slightly different output on different JVMs
                                              (u.date/format-human-readable #t "2021-04-02T15:52:00-07:00[US/Pacific]")]]
                          (is (str/includes? message expected-str))))))

                  (testing "don't send email on subsequent login from same device"
                    (mt/reset-inbox!)
                    (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id device}]
                      (is (= {}
                             @mt/inbox))))))))))))

  (testing "don't send email if the setting is disabled by setting MB_SEND_EMAIL_ON_FIRST_LOGIN_FROM_NEW_DEVICE=FALSE"
    (mt/with-temp [:model/User {user-id :id}]
      (mt/with-fake-inbox
        ;; can't use `mt/with-temporary-setting-values` here because it's a read-only setting
        (mt/with-temp-env-var-value! [mb-send-email-on-first-login-from-new-device "FALSE"]
          (mt/with-temp [:model/LoginHistory _ {:user_id user-id, :device_id (str (random-uuid))}
                         :model/LoginHistory _ {:user_id user-id, :device_id (str (random-uuid))}]
            (is (= {}
                   @mt/inbox))))))))

(deftest login-email-fall-back-name-test
  (mt/test-helpers-set-global-values!
    (let [original-maybe-send (var-get #'metabase.login-history.record/maybe-send-login-from-new-device-email)
          new-login-email (fn [user-id email]
                            (mt/with-fake-inbox
                              (with-redefs [request/geocode-ip-addresses (fn [ip-addresses]
                                                                           (into {} (for [ip-address ip-addresses]
                                                                                      [ip-address
                                                                                       {:description "San Francisco, California, United States"
                                                                                        :timezone    (t/zone-id "America/Los_Angeles")}])))
                                            metabase.login-history.record/maybe-send-login-from-new-device-email
                                            (fn [login-history]
                                              (when-let [futur (original-maybe-send login-history)]
                                                ;; block in tests
                                                (u/deref-with-timeout futur 10000)))]
                                (let [device (str (random-uuid))]
                                  (mt/with-temp [:model/LoginHistory _ {:user_id   user-id
                                                                        :device_id (str (random-uuid))}
                                                 :model/LoginHistory _ {:user_id   user-id
                                                                        :device_id device
                                                                        :timestamp #t "2021-04-02T15:52:00-07:00[US/Pacific]"}]
                                    (#'metabase.login-history.record/maybe-send-login-from-new-device-email
                                     {:user_id user-id
                                      :device_id device
                                      :timestamp #t "2021-04-02T15:52:00-07:00[US/Pacific]"
                                      :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML  like Gecko) Chrome/89.0.4389.86 Safari/537.36"})
                                    (mt/email-subjects email))))))]
      (testing "Use first name if exists"
        (mt/with-temp [:model/User {user-id :id
                                    email :email} {:first_name "Ngoc"
                                                   :last_name  "Khuat"}]
          (is (contains? (new-login-email user-id email) "We've Noticed a New Metabase Login, Ngoc"))))

      (testing "fallback to last name if user has no first_name"
        (mt/with-temp [:model/User {user-id :id email :email} {:first_name nil :last_name  "Khuat"}]
          (is (contains? (new-login-email user-id email)
                         "We've Noticed a New Metabase Login, Khuat"))))

      (testing "Else Use email if both first_name and last_name are null"
        (mt/with-temp [:model/User {user-id :id email :email} {:first_name nil
                                                               :last_name  nil
                                                               :email      "cto@metabase.com"}]
          (is (contains? (new-login-email user-id email)
                         "We've Noticed a New Metabase Login, cto@metabase.com")))))))

(deftest create-session-test
  (mt/with-temp [:model/User {user-id :id}]
    (mt/with-model-cleanup [:model/Session]
      (let [key (session/generate-session-key)
            session (t2/insert-returning-instance! :model/Session
                                                   :id (session/generate-session-id)
                                                   :user_id user-id
                                                   :session_key key)]
        (is (nil? (:key session)) "Key is not returned by the insert")
        (is (= (session/hash-session-key key) (t2/select-one-fn :key_hashed :model/Session :user_id user-id)))))))

(deftest ^:parallel hash-session-key-test
  (is (= "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff"
         (session/hash-session-key "test")))
  (is (= "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff"
         (session/hash-session-key "test")))
  (is (= "6d201beeefb589b08ef0672dac82353d0cbd9ad99e1642c83a1601f3d647bcca003257b5e8f31bdc1d73fbec84fb085c79d6e2677b7ff927e823a54e789140d9"
         (session/hash-session-key "test2"))))
