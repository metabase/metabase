(ns metabase.server.middleware.session-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [environ.core :as env]
            [expectations :refer [expect]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.config :as config]
            [metabase.core.initialization-status :as init-status]
            [metabase.db :as mdb]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models :refer [Session User]]
            [metabase.server.middleware.session :as mw.session]
            [metabase.test :as mt]
            [metabase.test.data.users :as test-users]
            [metabase.util.i18n :as i18n]
            [ring.mock.request :as mock]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import clojure.lang.ExceptionInfo
           java.util.UUID))

(use-fixtures :once (fn [thunk]
                      (init-status/set-complete!)
                      (thunk)))

(def ^:private session-cookie @#'mw.session/metabase-session-cookie)

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
  (let [uuid (UUID/randomUUID)]
    (testing "should unset the old SESSION_ID if it's present"
      (is (= {"metabase.SESSION"
              {:value     (str uuid)
               :same-site :lax
               :http-only true
               :path      "/"
               :max-age   1209600}}
             (-> (mw.session/set-session-cookie {} {} {:id uuid, :type :normal})
                 :cookies))))
    (testing "if `MB_SESSION_COOKIES=true` we shouldn't set a `Max-Age`"
      (is (= {:value     (str uuid)
              :same-site :lax
              :http-only true
              :path      "/"}
             (let [env env/env]
               (with-redefs [env/env (assoc env :mb-session-cookies "true")]
                 (-> (mw.session/set-session-cookie {} {} {:id uuid, :type :normal})
                     (get-in [:cookies "metabase.SESSION"])))))))))

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
            actual  (-> (mw.session/set-session-cookie {:headers headers} {} session)
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

;; test that we can set a full-app-embedding session cookie
(expect
  {:body    {}
   :status  200
   :cookies {embedded-session-cookie
             {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
              :http-only true
              :path      "/"}}
   :headers {anti-csrf-token-header test-anti-csrf-token}}
  (mw.session/set-session-cookie {} {} test-full-app-embed-session))


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


;; no session-id in the request
(expect
  nil
  (-> (wrapped-handler (mock/request :get "/anyurl") )
      :metabase-session-id))


;; extract session-id from header
(expect
  "foobar"
  (:metabase-session-id
   (wrapped-handler
    (mock/header (mock/request :get "/anyurl") session-header "foobar"))))


;; extract session-id from cookie
(expect
  "cookie-session"
  (:metabase-session-id
   (wrapped-handler
    (assoc (mock/request :get "/anyurl")
      :cookies {session-cookie {:value "cookie-session"}}))))


;; if both header and cookie session-ids exist, then we expect the cookie to take precedence
(expect
  "cookie-session"
  (:metabase-session-id
   (wrapped-handler
    (assoc (mock/header (mock/request :get "/anyurl") session-header "foobar")
           :cookies {session-cookie {:value "cookie-session"}}))))

;; `wrap-session-id` should handle anti-csrf headers they way we'd expect
(expect
  {:anti-csrf-token     "84482ddf1bb178186ed9e1c0b1e05a2d"
   :cookies             {embedded-session-cookie {:value "092797dd-a82a-4748-b393-697d7bb9ab65"}}
   :metabase-session-id "092797dd-a82a-4748-b393-697d7bb9ab65"
   :uri                 "/anyurl"}
  (let [request (-> (mock/request :get "/anyurl")
                    (assoc :cookies {embedded-session-cookie {:value (str test-uuid)}})
                    (assoc-in [:headers anti-csrf-token-header] test-anti-csrf-token))]
    (select-keys (wrapped-handler request) [:anti-csrf-token :cookies :metabase-session-id :uri])))

(deftest current-user-info-for-session-test
  (testing "make sure the `current-user-info-for-session` logic is working correctly"
    ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
    ;; the way we'd expect :/
    (try
      (tt/with-temp Session [session {:id (str test-uuid), :user_id (test-users/user->id :lucky)}]
        (is (= {:metabase-user-id (test-users/user->id :lucky), :is-superuser? false, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "superusers should come back as `:is-superuser?`"
    (try
      (tt/with-temp Session [session {:id (str test-uuid), :user_id (test-users/user->id :crowberto)}]
        (is (= {:metabase-user-id (test-users/user->id :crowberto), :is-superuser? true, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "full-app-embed sessions shouldn't come back if we don't explicitly specifiy the anti-csrf token"
    (try
      (tt/with-temp Session [session {:id              (str test-uuid)
                                      :user_id         (test-users/user->id :lucky)
                                      :anti_csrf_token test-anti-csrf-token}]
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid))))

    (testing "...but if we do specifiy the token, they should come back"
      (try
        (tt/with-temp Session [session {:id              (str test-uuid)
                                        :user_id         (test-users/user->id :lucky)
                                        :anti_csrf_token test-anti-csrf-token}]
          (is (= {:metabase-user-id (test-users/user->id :lucky), :is-superuser? false, :user-locale nil}
                 (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token))))
        (finally
          (db/delete! Session :id (str test-uuid))))

      (testing "(unless the token is wrong)"
        (try
          (tt/with-temp Session [session {:id              (str test-uuid)
                                          :user_id         (test-users/user->id :lucky)
                                          :anti_csrf_token test-anti-csrf-token}]
            (is (= nil
                   (#'mw.session/current-user-info-for-session (str test-uuid) (str/join (reverse test-anti-csrf-token))))))
          (finally
            (db/delete! Session :id (str test-uuid)))))))

  (testing "if we specify an anti-csrf token we shouldn't get back a session without that token"
    (try
      (tt/with-temp Session [session {:id      (str test-uuid)
                                      :user_id (test-users/user->id :lucky)}]
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch expired sessions"
    (try
      (tt/with-temp Session [session {:id      (str test-uuid)
                                      :user_id (test-users/user->id :lucky)}]
        ;; use low-level `execute!` because updating is normally disallowed for Sessions
        (db/execute! {:update Session, :set {:created_at (java.sql.Date. 0)}, :where [:= :id (str test-uuid)]})
        (is (= nil
               (#'mw.session/current-user-info-for-session (str test-uuid) nil))))
      (finally
        (db/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch sessions for inactive users"
    (try
      (tt/with-temp Session [session {:id (str test-uuid), :user_id (test-users/user->id :trashbird)}]
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
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-user-id user-id)))


;; with valid user-id
(expect
  {:user-id (test-users/user->id :rasta)
   :user    {:id    (test-users/user->id :rasta)
             :email (:email (test-users/fetch-user :rasta))}}
  (user-bound-handler
   (request-with-user-id (test-users/user->id :rasta))))

;; with invalid user-id (not sure how this could ever happen, but lets test it anyways)
(expect
  {:user-id 0
   :user    {}}
  (user-bound-handler
   (request-with-user-id 0)))


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
