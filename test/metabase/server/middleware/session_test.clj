(ns metabase.server.middleware.session-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [environ.core :as env]
            [java-time :as t]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.config :as config]
            [metabase.core.initialization-status :as init-status]
            [metabase.db :as mdb]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models :refer [PermissionsGroupMembership Session User]]
            [metabase.public-settings :as public-settings]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.server.middleware.session :as mw.session]
            [metabase.test :as mt]
            [metabase.util.i18n :as i18n]
            [ring.mock.request :as ring.mock]
            [toucan.db :as db])
  (:import clojure.lang.ExceptionInfo
           java.util.UUID))

(use-fixtures :once (fn [thunk]
                      (init-status/set-complete!)
                      (thunk)))

(def ^:private session-cookie @#'mw.session/metabase-session-cookie)
(def ^:private session-timeout-cookie @#'mw.session/metabase-session-timeout-cookie)

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

(deftest session-cookie-test
  (testing "`SameSite` value is read from config (env)"
    (is (= :lax ; Default value
           (with-redefs [env/env (dissoc env/env :mb-session-cookie-samesite)]
             (#'config/mb-session-cookie-samesite*))))

    (is (= :strict
           (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "StRiCt")]
             (#'config/mb-session-cookie-samesite*))))

    (is (= :none
           (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "NONE")]
             (#'config/mb-session-cookie-samesite*))))

    (is (thrown-with-msg? ExceptionInfo #"Invalid value for MB_COOKIE_SAMESITE"
          (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "invalid value")]
            (#'config/mb-session-cookie-samesite*))))))

(deftest set-session-cookie-test
  (mt/with-temporary-setting-values [session-timeout nil]
    (let [uuid (UUID/randomUUID)
          request-time (t/zoned-date-time "2022-07-06T02:00Z[UTC]")]
      (testing "should unset the old SESSION_ID if it's present"
        (is (= {:value     (str uuid)
                :same-site :lax
                :http-only true
                :path      "/"}
               (-> (mw.session/set-session-cookies {} {} {:id uuid, :type :normal} request-time)
                   (get-in [:cookies "metabase.SESSION"])))))
      (testing "should set `Max-Age` if `remember` is true in request"
        (is (= {:value     (str uuid)
                :same-site :lax
                :http-only true
                :path      "/"
                :max-age   1209600}
               (-> (mw.session/set-session-cookies {:body {:remember true}} {} {:id uuid, :type :normal} request-time)
                   (get-in [:cookies "metabase.SESSION"])))))
      (testing "if `MB_SESSION_COOKIES=true` we shouldn't set a `Max-Age`, even if `remember` is true"
        (is (= {:value     (str uuid)
                :same-site :lax
                :http-only true
                :path      "/"}
               (let [env env/env]
                 (mt/with-temporary-setting-values [session-cookies true]
                   (-> (mw.session/set-session-cookies {:body {:remember true}} {} {:id uuid, :type :normal} request-time)
                       (get-in [:cookies "metabase.SESSION"]))))))))))

;; if request is an HTTPS request then we should set `:secure true`. There are several different headers we check for
;; this. Make sure they all work.
(deftest secure-cookie-test
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
      (let [session {:id   (UUID/randomUUID)
                     :type :normal}
            actual  (-> (mw.session/set-session-cookies {:headers headers} {} session (t/zoned-date-time "2022-07-06T02:01Z[UTC]"))
                        (get-in [:cookies "metabase.SESSION" :secure])
                        boolean)]
        (is (= expected actual))))))

(deftest session-expired-test
  (testing "Session expiration time = 1 minute"
    (with-redefs [env/env (assoc env/env :max-session-age "1")]
      (doseq [[created-at expected msg]
              [[:%now                                                               false "brand-new session"]
               [#t "1970-01-01T00:00:00Z"                                           true  "really old session"]
               [(sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -61 :second) true  "session that is 61 seconds old"]
               [(sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -59 :second) false "session that is 59 seconds old"]]]
        (testing (format "\n%s %s be expired." msg (if expected "SHOULD" "SHOULD NOT"))
          (mt/with-temp User [{user-id :id}]
            (let [session-id (str (UUID/randomUUID))]
              (db/simple-insert! Session {:id session-id, :user_id user-id, :created_at created-at})
              (let [session (#'mw.session/current-user-info-for-session session-id nil)]
                (if expected
                  (is (= nil
                         session))
                  (is (some? session)))))))))))


;;; ------------------------------------- tests for full-app embedding sessions --------------------------------------

(def ^:private embedded-session-cookie @#'mw.session/metabase-embedded-session-cookie)
(def ^:private anti-csrf-token-header @#'mw.session/anti-csrf-token-header)

(def ^:private test-anti-csrf-token "84482ddf1bb178186ed9e1c0b1e05a2d")

(def ^:private test-full-app-embed-session
  {:id               test-uuid
   :anti_csrf_token  test-anti-csrf-token
   :type             :full-app-embed})

(deftest set-full-app-embedding-session-cookie-test
  (mt/with-temporary-setting-values [session-timeout nil]
    (testing "test that we can set a full-app-embedding session cookie"
      (is (= {:body    {}
              :status  200
              :cookies {embedded-session-cookie {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
                                                 :http-only true
                                                 :path      "/"}
                        session-timeout-cookie  {:value     "alive"
                                                 :path      "/"}}
              :headers {anti-csrf-token-header test-anti-csrf-token}}
             (mw.session/set-session-cookies {}
                                            {}
                                            test-full-app-embed-session
                                            (t/zoned-date-time "2022-07-06T02:00Z[UTC]")))))
    (testing "test that we can set a full-app-embedding session cookie with SameSite=None over HTTPS"
      (is (= {:body    {}
              :status  200
              :cookies {embedded-session-cookie {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
                                                 :http-only true
                                                 :path      "/"
                                                 :same-site :none
                                                 :secure    true}
                        session-timeout-cookie  {:value     "alive"
                                                 :path      "/"
                                                 :same-site :none
                                                 :secure    true}}
              :headers {anti-csrf-token-header test-anti-csrf-token}}
             (mw.session/set-session-cookies {:headers {"x-forwarded-protocol" "https"}}
                                            {}
                                            test-full-app-embed-session
                                            (t/zoned-date-time "2022-07-06T02:01Z[UTC]")))))))


;;; ---------------------------------------- TEST wrap-session-id middleware -----------------------------------------

(def ^:private session-header @#'mw.session/metabase-session-header)

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(defn- wrapped-handler [request]
  ((mw.session/wrap-session-id
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(deftest no-session-id-in-request-test
  (testing "no session-id in the request"
    (is (= nil
           (-> (wrapped-handler (ring.mock/request :get "/anyurl"))
               :metabase-session-id)))))

(deftest header-test
  (testing "extract session-id from header"
    (is (= "foobar"
           (:metabase-session-id
            (wrapped-handler
             (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")))))))

(deftest cookie-test
  (testing "extract session-id from cookie"
    (is (= "cookie-session"
           (:metabase-session-id
            (wrapped-handler
             (assoc (ring.mock/request :get "/anyurl")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(deftest both-header-and-cookie-test
  (testing "if both header and cookie session-ids exist, then we expect the cookie to take precedence"
    (is (= "cookie-session"
           (:metabase-session-id
            (wrapped-handler
             (assoc (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(deftest anti-csrf-headers-test
  (testing "`wrap-session-id` should handle anti-csrf headers they way we'd expect"
    (let [request (-> (ring.mock/request :get "/anyurl")
                      (assoc :cookies {embedded-session-cookie {:value (str test-uuid)}})
                      (assoc-in [:headers anti-csrf-token-header] test-anti-csrf-token))]
      (is (= {:anti-csrf-token     "84482ddf1bb178186ed9e1c0b1e05a2d"
              :cookies             {embedded-session-cookie {:value "092797dd-a82a-4748-b393-697d7bb9ab65"}}
              :metabase-session-id "092797dd-a82a-4748-b393-697d7bb9ab65"
              :uri                 "/anyurl"}
             (select-keys (wrapped-handler request) [:anti-csrf-token :cookies :metabase-session-id :uri]))))))

(deftest current-user-info-for-session-test
  (testing "make sure the `current-user-info-for-session` logic is working correctly"
    ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
    ;; the way we'd expect :/
    (try
      (mt/with-temp Session [session {:id (str test-uuid), :user_id (mt/user->id :lucky)}]
        (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "superusers should come back as `:is-superuser?`"
    (try
      (mt/with-temp Session [session {:id (str test-uuid), :user_id (mt/user->id :crowberto)}]
        (is (= {:metabase-user-id (mt/user->id :crowberto), :is-superuser? true, :is-group-manager? false, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "If user is a group manager of at least one group, `:is-group-manager?` "
    (try
     (mt/with-user-in-groups
       [group-1 {:name "New Group 1"}
        group-2 {:name "New Group 2"}
        user    [group-1 group-2]]
       (db/update-where! PermissionsGroupMembership {:user_id (:id user), :group_id (:id group-2)}
                         :is_group_manager true)
       (mt/with-temp Session [_session {:id      (str test-uuid)
                                        :user_id (:id user)}]
         (testing "is `false` if advanced-permisison is disabled"
           (premium-features-test/with-premium-features #{}
           (is (= false
                  (:is-group-manager? (#'mw.session/current-user-info-for-session (str test-uuid) nil))))))

         (testing "is `true` if advanced-permisison is enabled"
           ;; a trick to run this test in OSS because even if advanced-permisison is enabled but EE ns is not evailable
           ;; `enable-advanced-permissions?` will still return false
           (with-redefs [premium-features/enable-advanced-permissions? (fn [& _args] true)]
             (is (= true
                    (:is-group-manager? (#'mw.session/current-user-info-for-session (str test-uuid) nil))))))))
         (finally
          (db/delete! Session :id (str test-uuid)))))

  (testing "full-app-embed sessions shouldn't come back if we don't explicitly specifiy the anti-csrf token"
    (try
      (mt/with-temp Session [session {:id              (str test-uuid)
                                      :user_id         (mt/user->id :lucky)
                                      :anti_csrf_token test-anti-csrf-token}]
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid))))

    (testing "...but if we do specifiy the token, they should come back"
      (try
        (mt/with-temp Session [session {:id              (str test-uuid)
                                        :user_id         (mt/user->id :lucky)
                                        :anti_csrf_token test-anti-csrf-token}]
          (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
                 (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token))))
        (finally
          (db/delete! Session :id (str test-uuid))))

      (testing "(unless the token is wrong)"
        (try
          (mt/with-temp Session [session {:id              (str test-uuid)
                                          :user_id         (mt/user->id :lucky)
                                          :anti_csrf_token test-anti-csrf-token}]
            (is (= nil
                   (#'mw.session/current-user-info-for-session (str test-uuid) (str/join (reverse test-anti-csrf-token))))))
          (finally
            (db/delete! Session :id (str test-uuid)))))))

  (testing "if we specify an anti-csrf token we shouldn't get back a session without that token"
    (try
      (mt/with-temp Session [session {:id      (str test-uuid)
                                      :user_id (mt/user->id :lucky)}]
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch expired sessions"
    (try
      (mt/with-temp Session [session {:id      (str test-uuid)
                                      :user_id (mt/user->id :lucky)}]
        ;; use low-level `execute!` because updating is normally disallowed for Sessions
        (db/execute! {:update Session, :set {:created_at (java.sql.Date. 0)}, :where [:= :id (str test-uuid)]})
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch sessions for inactive users"
    (try
      (mt/with-temp Session [session {:id (str test-uuid), :user_id (mt/user->id :trashbird)}]
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid))))))

;; create a simple example of our middleware wrapped around a handler that simply returns our bound variables for users
(defn- user-bound-handler [request]
  ((mw.session/bind-current-user
    (fn [_ respond _]
      (respond
       {:user-id *current-user-id*
        :user    (select-keys @*current-user* [:id :email])})))
   request
   identity
   (fn [e] (throw e))))

(defn- request-with-user-id
  "Creates a mock Ring request with the given user-id applied"
  [user-id]
  (-> (ring.mock/request :get "/anyurl")
      (assoc :metabase-user-id user-id)))

(deftest add-user-id-key-test
  (testing "with valid user-id"
    (is (= {:user-id (mt/user->id :rasta)
            :user    {:id    (mt/user->id :rasta)
                      :email (:email (mt/fetch-user :rasta))}}
           (user-bound-handler
            (request-with-user-id (mt/user->id :rasta))))))

  (testing "with invalid user-id (not sure how this could ever happen, but lets test it anyways)"
    (is (= {:user-id 0
            :user    {}}
           (user-bound-handler
            (request-with-user-id 0))))))


;;; ----------------------------------------------------- Locale -----------------------------------------------------

(deftest bind-locale-test
  (let [handler        (-> (fn [_ respond _]
                             (respond i18n/*user-locale*))
                           mw.session/bind-current-user
                           mw.session/wrap-current-user-info)
        session-locale (fn [session-id & {:as more}]
                         (handler
                          (merge {:metabase-session-id session-id} more)
                          identity
                          (fn [e] (throw e))))]
    (testing "No Session"
      (is (= nil
             (session-locale nil))))

    (testing "w/ Session"
      (testing "for user with no `:locale`"
        (mt/with-temp User [{user-id :id}]
          (let [session-id (str (UUID/randomUUID))]
            (db/insert! Session {:id session-id, :user_id user-id})
            (is (= nil
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "es_MX"
                     (session-locale session-id :headers {"x-metabase-locale" "es-mx"})))))))

      (testing "for user *with* `:locale`"
        (mt/with-temp User [{user-id :id} {:locale "es-MX"}]
          (let [session-id (str (UUID/randomUUID))]
            (db/insert! Session {:id session-id, :user_id user-id, :created_at :%now})
            (is (= "es_MX"
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "en_GB"
                     (session-locale session-id :headers {"x-metabase-locale" "en-GB"}))))))))))


;;; ----------------------------------------------------- Session timeout -----------------------------------------------------

(deftest session-timeout-tests
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        session-id   "8df268ab-00c0-4b40-9413-d66b966b696a"
        response     {:body    "some body",
                      :cookies {}}]

    (testing "`session-timeout` setting conversion to seconds"
      (is (= 10800
             (mw.session/session-timeout->seconds {:amount 180
                                                   :unit   "minutes"})))
      (is (= 60
             (mw.session/session-timeout->seconds {:amount 60
                                                   :unit   "seconds"})))
      (is (= 3600
             (mw.session/session-timeout->seconds {:amount 1
                                                   :unit   "hours"}))))

    (testing "The session timeout should be a minimum of 30 seconds"
      (is (= 60
             (mw.session/session-timeout->seconds {:amount 0
                                                   :unit   "minutes"}))))

    (testing "non-nil `session-timeout-seconds` should set the expiry relative to the request time"
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (testing "with normal sessions"
          (let [request {:cookies               {session-cookie         {:value session-id}
                                                 session-timeout-cookie {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :normal}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :same-site :lax
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"},
                              session-cookie         {:value     "8df268ab-00c0-4b40-9413-d66b966b696a",
                                                      :same-site :lax,
                                                      :path      "/",
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT",
                                                      :http-only true}}}
                   (mw.session/reset-session-timeout-on-response request response request-time)))))

        (testing "with embedded sessions"
          (let [request {:cookies               {embedded-session-cookie {:value session-id}
                                                 session-timeout-cookie  {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :full-app-embed}]
            (is (= {:body    "some body",
                    :headers {"x-metabase-anti-csrf-token" nil}
                    :cookies {session-timeout-cookie  {:value   "alive"
                                                       :path    "/"
                                                       :expires "Sat, 1 Jan 2022 01:00:00 GMT"},
                              embedded-session-cookie {:value     "8df268ab-00c0-4b40-9413-d66b966b696a",
                                                       :http-only true,
                                                       :path      "/",
                                                       :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout-on-response request response request-time)))))))

    (testing "If the request does not have session cookies (because they have expired), they should not be reset."
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (let [request {:cookies {}}]
          (is (= response
                 (mw.session/reset-session-timeout-on-response request response request-time))))))

    (testing "If [[public-settings/session-cookies]] is true, then the session and timeout cookies
              shouldn't have a max age or expires attribute."
      (with-redefs [env/env (assoc env/env :max-session-age "1")]
        (mt/with-temporary-setting-values [session-timeout nil
                                           public-settings/session-cookies true]
          (let [request {:metabase-session-id             session-id
                         :metabase-session-type           :normal
                         :cookies {session-cookie         {:value "session-id"}
                                   session-timeout-cookie {:value "alive"}}}
                session {:id session-id, :type :normal}]
            (is (= {:body    "some body"
                    :cookies {"metabase.TIMEOUT" {:value     "alive"
                                                  :same-site :lax
                                                  :path      "/"},
                              "metabase.SESSION" {:value     "8df268ab-00c0-4b40-9413-d66b966b696a"
                                                  :same-site :lax
                                                  :path      "/"
                                                  :http-only true}}}
                   (mw.session/set-session-cookies request response session request-time)))))))

    (testing "If [[public-settings/session-cookies]] is false, the user has checked 'Remember me'
              on login, and there is session-timeout is nil, the session and timeout cookies should
              have a max-age."
      (with-redefs [env/env (assoc env/env :max-session-age "1")]
        (mt/with-temporary-setting-values [session-timeout nil
                                           public-settings/session-cookies false]
          (let [request {:body                  {:remember true}
                         :metabase-session-id   session-id
                         :metabase-session-type :normal
                         :cookies               {session-cookie         {:value "session-id"}
                                                 session-timeout-cookie {:value "alive"}}}
                session {:id   session-id
                         :type :normal}]
            (is (= {:body    "some body",
                    :cookies {"metabase.TIMEOUT" {:value     "alive"
                                                  :same-site :lax
                                                  :path      "/"
                                                  :max-age   60},
                              "metabase.SESSION" {:value     "8df268ab-00c0-4b40-9413-d66b966b696a",
                                                  :same-site :lax,
                                                  :path      "/",
                                                  :max-age   60,
                                                  :http-only true}}}
                   (mw.session/set-session-cookies request response session request-time)))))))))
