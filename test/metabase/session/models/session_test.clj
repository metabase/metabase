(ns metabase.session.models.session-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.login-history.record]
   [metabase.public-settings :as public-settings]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

  ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
  ;; the way we'd expect :/
(defn- new-session! []
  (try
    (first (t2/insert-returning-instances! :model/Session {:id (str test-uuid), :user_id (mt/user->id :trashbird)}))
    (finally
      (t2/delete! :model/Session :id (str test-uuid)))))

(deftest new-session-include-test-test
  (testing "when creating a new Session, it should come back with an added `:type` key"
    (is (=? {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
             :user_id         (mt/user->id :trashbird)
             :anti_csrf_token nil
             :type            :normal}
            (new-session!)))))

(deftest embedding-test
  (testing "if request is an embedding request, we should get ourselves an embedded Session"
    (request/with-current-request {:headers {"x-metabase-embedded" "true"}}
      (with-redefs [session/random-anti-csrf-token (constantly "315c1279c6f9f873bf1face7afeee420")]
        (is (=? {:id              "092797dd-a82a-4748-b393-697d7bb9ab65"
                 :user_id         (mt/user->id :trashbird)
                 :anti_csrf_token "315c1279c6f9f873bf1face7afeee420"
                 :type            :full-app-embed}
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

                  (is (malli= [:map-of [:= email]
                               [:sequential
                                [:map {:closed true}
                                 [:from ms/Email]
                                 [:to [:= [email]]]
                                 [:subject [:= (format "We've Noticed a New Metabase Login, %s" first-name)]]
                                 [:body [:sequential [:map
                                                      [:type [:= "text/html; charset=utf-8"]]
                                                      [:content :string]]]]]]]
                              @mt/inbox))
                  (let [message  (-> @mt/inbox (get email) first :body first :content)
                        site-url (public-settings/site-url)]
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

(deftest email-depending-on-embedded
  (let [email-sent (atom false)]
    (with-redefs [metabase.login-history.record/maybe-send-login-from-new-device-email
                  (fn [_] (reset! email-sent true))]
      (testing "don't send email if an embedded login"
        (mt/with-temp [:model/User {user-id :id}]
          (session/create-session! :sso {:id user-id :last_login nil} {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
                                                                       :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
                                                                       :embedded           true
                                                                       :ip_address         "0:0:0:0:0:0:0:1"})
          (is (false? @email-sent))))
      (testing "do send email if not an embedded login"
        (reset! email-sent false)
        (mt/with-temp [:model/User {user-id :id}]
          (session/create-session! :sso {:id user-id :last_login nil} {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
                                                                       :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.72 Safari/537.36"
                                                                       :embedded           false
                                                                       :ip_address         "0:0:0:0:0:0:0:1"})
          (is (true? @email-sent)))))))

(deftest clean-sessions-test ()
  (mt/with-temp-env-var-value! [:max-session-age (str (* 60 24))] ;; one day

    (mt/with-temp [:model/User {user-id :id} {}
                   :model/Session old-session {:id         "a"
                                               :user_id    user-id
                                               :created_at (t/minus (t/local-date-time) (t/days 2))}
                   :model/Session new-session {:id         "b"
                                               :user_id    user-id
                                               :created_at (t/minus (t/local-date-time) (t/hours 5))}]
      (testing "session-cleanup deletes old sessions and keeps new enough ones"
        (is (t2/select-one :model/Session :id (old-session :id)))
        (session/cleanup-sessions!)
        (is (not (t2/exists? :model/Session :id (:id old-session))))
        (is (t2/exists? :model/Session :id (:id new-session)))))))
