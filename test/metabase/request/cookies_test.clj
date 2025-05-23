(ns metabase.request.cookies-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.request.cookies :as request.cookies]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.test :as mt]))

(deftest set-session-cookie-test
  (mt/with-temporary-setting-values [session-timeout nil]
    (let [session-key (session/generate-session-key)
          request-time (t/zoned-date-time "2022-07-06T02:00Z[UTC]")]
      (testing "should unset the old SESSION_ID if it's present"
        (is (= {:value     session-key
                :same-site :lax
                :http-only true
                :path      "/"}
               (-> (request.cookies/set-session-cookies {} {} {:key session-key, :type :normal} request-time)
                   (get-in [:cookies "metabase.SESSION"])))))
      (testing "should set `Max-Age` if `remember` is true in request"
        (is (= {:value     session-key
                :same-site :lax
                :http-only true
                :path      "/"
                :max-age   1209600}
               (-> (request.cookies/set-session-cookies {:body {:remember true}} {} {:key session-key, :type :normal} request-time)
                   (get-in [:cookies "metabase.SESSION"])))))
      (testing "if `MB_SESSION_COOKIES=true` we shouldn't set a `Max-Age`, even if `remember` is true"
        (is (= {:value     session-key
                :same-site :lax
                :http-only true
                :path      "/"}
               (mt/with-temporary-setting-values [session-cookies true]
                 (-> (request.cookies/set-session-cookies {:body {:remember true}} {} {:key session-key, :type :normal} request-time)
                     (get-in [:cookies "metabase.SESSION"])))))))))

(deftest samesite-none-log-warning-test
  (mt/with-temporary-setting-values [session-cookie-samesite :none]
    (let [session {:key  (session/generate-session-key)
                   :type :normal}
          request-time (t/zoned-date-time "2022-07-06T02:00Z[UTC]")]
      (testing "should log a warning if SameSite is configured to \"None\" and the site is served over an insecure connection."
        (mt/with-log-messages-for-level [messages :warn]
          (request.cookies/set-session-cookies {:headers {"x-forwarded-proto" "http"}} {} session request-time)
          (is (contains? (into #{}
                               (map :message)
                               (messages))
                         (str "Session cookie's SameSite is configured to \"None\", but site is served over an"
                              " insecure connection. Some browsers will reject cookies under these conditions."
                              " https://www.chromestatus.com/feature/5633521622188032")))))
      (testing "should not log a warning over a secure connection."
        (mt/with-log-messages-for-level [messages :warn]
          (request.cookies/set-session-cookies {:headers {"x-forwarded-proto" "https"}} {} session request-time)
          (is (not (contains? (into #{}
                                    (map :message)
                                    (messages))
                              (str "Session cookie's SameSite is configured to \"None\", but site is served over an"
                                   " insecure connection. Some browsers will reject cookies under these conditions."
                                   " https://www.chromestatus.com/feature/5633521622188032")))))))))

;; if request is an HTTPS request then we should set `:secure true`. There are several different headers we check for
;; this. Make sure they all work.
(deftest ^:parallel secure-cookie-test
  (doseq [[headers expected] [[{"x-forwarded-proto" "https"}    true]
                              [{"x-forwarded-proto" "http"}     false]
                              [{"x-forwarded-protocol" "https"} true]
                              [{"x-forwarded-protocol" "http"}  false]
                              [{"x-url-scheme" "https"}         true]
                              [{"x-url-scheme" "http"}          false]
                              [{"x-forwarded-ssl" "on"}         true]
                              [{"x-forwarded-ssl" "off"}        false]
                              [{"front-end-https" "on"}         true]
                              [{"front-end-https" "off"}        false]
                              [{"origin" "https://mysite.com"}  true]
                              [{"origin" "http://mysite.com"}   false]]]
    (testing (format "With headers %s we %s set the 'secure' attribute on the session cookie"
                     (pr-str headers) (if expected "SHOULD" "SHOULD NOT"))
      (let [session {:key  (random-uuid)
                     :type :normal}
            actual  (-> (request.cookies/set-session-cookies {:headers headers} {} session (t/zoned-date-time "2022-07-06T02:01Z[UTC]"))
                        (get-in [:cookies "metabase.SESSION" :secure])
                        boolean)]
        (is (= expected actual))))))

(def ^:private anti-csrf-token-header request.cookies/anti-csrf-token-header)

(def ^:private test-anti-csrf-token "84482ddf1bb178186ed9e1c0b1e05a2d")

(def ^:private test-session-key "092797dd-a82a-4748-b393-697d7bb9ab65")

(def ^:private test-full-app-embed-session
  {:key             test-session-key
   :anti_csrf_token test-anti-csrf-token
   :type            :full-app-embed})

(deftest set-full-app-embedding-session-cookie-test
  (mt/with-temp-env-var-value! [:max-session-age "1"]
    (mt/with-temporary-setting-values [session-timeout nil]
      (testing "test that we can set a full-app-embedding session cookie"
        (is (= {:body    {}
                :status  200
                :cookies {request.cookies/metabase-embedded-session-cookie
                          {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
                           :http-only true
                           :path      "/"}

                          request.cookies/metabase-session-timeout-cookie
                          {:value     "alive"
                           :path      "/"
                           :max-age   60}}
                :headers {anti-csrf-token-header test-anti-csrf-token}}
               (request.cookies/set-session-cookies {}
                                                    {}
                                                    test-full-app-embed-session
                                                    (t/zoned-date-time "2022-07-06T02:00Z[UTC]")))))
      (testing "test that we can set a full-app-embedding session cookie with SameSite=None over HTTPS"
        (is (= {:body    {}
                :status  200
                :cookies {request.cookies/metabase-embedded-session-cookie
                          {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
                           :http-only true
                           :path      "/"
                           :same-site :none
                           :secure    true}

                          request.cookies/metabase-session-timeout-cookie
                          {:value     "alive"
                           :path      "/"
                           :same-site :none
                           :secure    true
                           :max-age   60}}
                :headers {anti-csrf-token-header test-anti-csrf-token}}
               (request.cookies/set-session-cookies {:headers {"x-forwarded-protocol" "https"}}
                                                    {}
                                                    test-full-app-embed-session
                                                    (t/zoned-date-time "2022-07-06T02:01Z[UTC]"))))))))

(deftest ^:parallel session-timeout-test
  (testing "`session-timeout` setting conversion to seconds"
    (is (= 10800
           (request.cookies/session-timeout->seconds {:amount 180
                                                      :unit   "minutes"})))
    (is (= 60
           (request.cookies/session-timeout->seconds {:amount 60
                                                      :unit   "seconds"})))
    (is (= 3600
           (request.cookies/session-timeout->seconds {:amount 1
                                                      :unit   "hours"})))))

(deftest ^:parallel session-timeout-test-2
  (testing "The session timeout should be a minimum of 30 seconds"
    (is (= 60
           (request.cookies/session-timeout->seconds {:amount 0
                                                      :unit   "minutes"})))))

(deftest session-timeout-test-3
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        session-key   "8df268ab-00c0-4b40-9413-d66b966b696a"
        response     {:body    "some body",
                      :cookies {}}]
    (testing (str "If [[metabase.session.settings/session-cookies]] is false and the `:remember` flag is set, then the"
                  " session cookie should have a max age attribute.")
      (mt/with-temp-env-var-value! [:max-session-age "1"]
        (mt/with-temporary-setting-values [session-timeout nil
                                           session-cookies false]
          (let [request {:body                  {:remember true}
                         :metabase-session-key   session-key
                         :metabase-session-type :normal
                         :cookies               {request.cookies/metabase-session-cookie         {:value "session-key"}
                                                 request.cookies/metabase-session-timeout-cookie {:value "alive"}}}
                session {:key  session-key
                         :type :normal}]
            (is (= {:body    "some body"
                    :cookies {"metabase.TIMEOUT" {:value     "alive"
                                                  :same-site :lax
                                                  :max-age   60
                                                  :path      "/"},
                              "metabase.SESSION" {:value     "8df268ab-00c0-4b40-9413-d66b966b696a"
                                                  :same-site :lax
                                                  :path      "/"
                                                  :max-age   60
                                                  :http-only true}}}
                   (request/set-session-cookies request response session request-time)))))))))

(deftest session-timeout-test-4
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        session-key   "8df268ab-00c0-4b40-9413-d66b966b696a"
        response     {:body    "some body",
                      :cookies {}}]
    (testing (str "If [[metabase.session.settings/session-cookies]] is true and the `:remember` flag is set, then the"
                  " session cookie shouldn't have a max age attribute.")
      (mt/with-temp-env-var-value! [:max-session-age "1"]
        (mt/with-temporary-setting-values [session-timeout nil
                                           session-cookies true]
          (let [request {:metabase-session-key  session-key
                         :metabase-session-type :normal
                         :remember              "true"
                         :cookies               {request.cookies/metabase-session-cookie         {:value "session-key"}
                                                 request.cookies/metabase-session-timeout-cookie {:value "alive"}}}
                session {:key  session-key
                         :type :normal}]
            (is (= {:body    "some body"
                    :cookies {"metabase.TIMEOUT" {:value     "alive"
                                                  :same-site :lax
                                                  :max-age   60
                                                  :path      "/"},
                              "metabase.SESSION" {:value     "8df268ab-00c0-4b40-9413-d66b966b696a"
                                                  :same-site :lax
                                                  :path      "/"
                                                  :http-only true}}}
                   (request/set-session-cookies request response session request-time)))))))))
