(ns metabase.server.middleware.session-test
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api.common :as api :refer [*current-user*
                                        *current-user-id*
                                        *is-group-manager?*
                                        *is-superuser?*]]
   [metabase.core.initialization-status :as init-status]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models :refer [PermissionsGroupMembership Session User]]
   [metabase.models.setting :as setting]
   [metabase.models.setting-test :as setting-test]
   [metabase.models.user :as user]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [metabase.util.secret :as u.secret]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)


(def ^:private session-cookie mw.session/metabase-session-cookie)
(def ^:private session-timeout-cookie @#'mw.session/metabase-session-timeout-cookie)

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

(deftest session-cookie-test
  (testing "`SameSite` value is read from config (env)"
    (is (= :lax ; Default value
           (with-redefs [env/env (dissoc env/env :mb-session-cookie-samesite)]
             (mw.session/session-cookie-samesite))))

    (is (= :strict
           (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "StRiCt")]
             (mw.session/session-cookie-samesite))))

    (is (= :none
           (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "NONE")]
             (mw.session/session-cookie-samesite))))

    (is (thrown-with-msg? ExceptionInfo #"Invalid value for session cookie samesite"
          (with-redefs [env/env (assoc env/env :mb-session-cookie-samesite "invalid value")]
            (mw.session/session-cookie-samesite))))))

(deftest set-session-cookie-test
  (mt/with-temporary-setting-values [session-timeout nil]
    (let [uuid (random-uuid)
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
               (mt/with-temporary-setting-values [session-cookies true]
                 (-> (mw.session/set-session-cookies {:body {:remember true}} {} {:id uuid, :type :normal} request-time)
                     (get-in [:cookies "metabase.SESSION"])))))))))

(deftest samesite-none-log-warning-test
  (mt/with-temporary-setting-values [session-cookie-samesite :none]
    (let [session {:id   (random-uuid)
                   :type :normal}
          request-time (t/zoned-date-time "2022-07-06T02:00Z[UTC]")]
      (testing "should log a warning if SameSite is configured to \"None\" and the site is served over an insecure connection."
        (is (contains? (into #{}
                             (map (fn [[_log-level _error message]] message))
                             (mt/with-log-messages-for-level :warn
                               (mw.session/set-session-cookies {:headers {"x-forwarded-proto" "http"}} {} session request-time)))
                       "Session cookies SameSite is configured to \"None\", but site is served over an insecure connection. Some browsers will reject cookies under these conditions. https://www.chromestatus.com/feature/5633521622188032")))
      (testing "should not log a warning over a secure connection."
        (is (not (contains? (into #{}
                                  (map (fn [[_log-level _error message]] message))
                                  (mt/with-log-messages-for-level :warn
                                    (mw.session/set-session-cookies {:headers {"x-forwarded-proto" "https"}} {} session request-time)))
                            "Session cookies SameSite is configured to \"None\", but site is served over an insecure connection. Some browsers will reject cookies under these conditions. https://www.chromestatus.com/feature/5633521622188032")))))))

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
      (let [session {:id   (random-uuid)
                     :type :normal}
            actual  (-> (mw.session/set-session-cookies {:headers headers} {} session (t/zoned-date-time "2022-07-06T02:01Z[UTC]"))
                        (get-in [:cookies "metabase.SESSION" :secure])
                        boolean)]
        (is (= expected actual))))))

(deftest session-expired-test
  (init-status/set-complete!)
  (testing "Session expiration time = 1 minute"
    (with-redefs [env/env (assoc env/env :max-session-age "1")]
      (doseq [[created-at expected msg]
              [[:%now                                                               false "brand-new session"]
               [#t "1970-01-01T00:00:01Z"                                           true  "really old session"]
               [(sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -61 :second) true  "session that is 61 seconds old"]
               [(sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -59 :second) false "session that is 59 seconds old"]]]
        (testing (format "\n%s %s be expired." msg (if expected "SHOULD" "SHOULD NOT"))
          (t2.with-temp/with-temp [User {user-id :id}]
            (let [session-id (str (random-uuid))]
              (t2/insert! (t2/table-name Session) {:id session-id, :user_id user-id, :created_at created-at})
              (let [session (#'mw.session/current-user-info-for-session session-id nil)]
                (if expected
                  (is (nil? session))
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
  (with-redefs [env/env (assoc env/env :max-session-age "1")]
    (mt/with-temporary-setting-values [session-timeout nil]
      (testing "test that we can set a full-app-embedding session cookie"
        (is (= {:body    {}
                :status  200
                :cookies {embedded-session-cookie {:value     "092797dd-a82a-4748-b393-697d7bb9ab65"
                                                   :http-only true
                                                   :path      "/"}
                          session-timeout-cookie  {:value     "alive"
                                                   :path      "/"
                                                   :max-age   60}}
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
                                                   :secure    true
                                                   :max-age   60}}
                :headers {anti-csrf-token-header test-anti-csrf-token}}
               (mw.session/set-session-cookies {:headers {"x-forwarded-protocol" "https"}}
                                               {}
                                               test-full-app-embed-session
                                               (t/zoned-date-time "2022-07-06T02:01Z[UTC]"))))))))


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

(deftest ^:parallel no-session-id-in-request-test
  (testing "no session-id in the request"
    (is (= nil
           (-> (wrapped-handler (ring.mock/request :get "/anyurl"))
               :metabase-session-id)))))

(deftest ^:parallel header-test
  (testing "extract session-id from header"
    (is (= "foobar"
           (:metabase-session-id
            (wrapped-handler
             (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")))))))

(deftest ^:parallel cookie-test
  (testing "extract session-id from cookie"
    (is (= "cookie-session"
           (:metabase-session-id
            (wrapped-handler
             (assoc (ring.mock/request :get "/anyurl")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(deftest ^:parallel both-header-and-cookie-test
  (testing "if both header and cookie session-ids exist, then we expect the cookie to take precedence"
    (is (= "cookie-session"
           (:metabase-session-id
            (wrapped-handler
             (assoc (ring.mock/header (ring.mock/request :get "/anyurl") session-header "foobar")
                    :cookies {session-cookie {:value "cookie-session"}})))))))

(deftest ^:parallel anti-csrf-headers-test
  (testing "`wrap-session-id` should handle anti-csrf headers they way we'd expect"
    (let [request (-> (ring.mock/request :get "/anyurl")
                      (assoc :cookies {embedded-session-cookie {:value (str test-uuid)}})
                      (assoc-in [:headers anti-csrf-token-header] test-anti-csrf-token))]
      (is (= {:anti-csrf-token     "84482ddf1bb178186ed9e1c0b1e05a2d"
              :cookies             {embedded-session-cookie {:value "092797dd-a82a-4748-b393-697d7bb9ab65"}}
              :metabase-session-id "092797dd-a82a-4748-b393-697d7bb9ab65"
              :uri                 "/anyurl"}
             (select-keys (wrapped-handler request) [:anti-csrf-token :cookies :metabase-session-id :uri]))))))

(deftest current-user-info-for-api-key-test
  (t2.with-temp/with-temp [:model/ApiKey _ {:name          "An API Key"
                                            :user_id       (mt/user->id :lucky)
                                            :creator_id    (mt/user->id :lucky)
                                            :updated_by_id (mt/user->id :lucky)
                                            :unhashed_key  (u.secret/secret "mb_foobar")}]
    (testing "A valid API key works, and user info is added to the request"
      (let [req {:headers {"x-api-key" "mb_foobar"}}]
        (is (= (merge req {:metabase-user-id  (mt/user->id :lucky)
                           :is-superuser?     false
                           :is-group-manager? false
                           :user-locale       nil})
               (#'mw.session/merge-current-user-info req)))))
    (testing "Various invalid API keys do not modify the request"
      (are [req] (= req (#'mw.session/merge-current-user-info req))
        ;; a matching prefix, invalid key
        {:headers {"x-api-key" "mb_fooby"}}

        ;; no matching prefix, invalid key
        {:headers {"x-api-key" "abcde"}}

        ;; no key at all
        {:headers {}}))))

(defn- simple-auth-handler
  "A handler that just does authentication and returns a map from the dynamic variables that are bound as a result."
  [request]
  (let [handler (fn [_ respond _]
                  (respond
                   {:user-id           *current-user-id*
                    :is-superuser?     *is-superuser?*
                    :is-group-manager? *is-group-manager?*
                    :user              (select-keys @*current-user* [:id :email])}))]
    ((-> handler
         mw.session/bind-current-user
         mw.session/wrap-current-user-info)
     request
     identity
     (fn [e] (throw e)))))

(deftest user-data-is-correctly-bound-for-api-keys
  (t2.with-temp/with-temp [:model/ApiKey _ {:name          "An API Key"
                                            :user_id       (mt/user->id :lucky)
                                            :creator_id    (mt/user->id :lucky)
                                            :updated_by_id (mt/user->id :lucky)
                                            :unhashed_key  (u.secret/secret "mb_foobar")}
                           :model/ApiKey _ {:name          "A superuser API Key"
                                            :user_id       (mt/user->id :crowberto)
                                            :creator_id    (mt/user->id :lucky)
                                            :updated_by_id (mt/user->id :lucky)
                                            :unhashed_key  (u.secret/secret "mb_superuser")}]
    (testing "A valid API key works, and user info is added to the request"
      (is (= {:is-superuser?     false
              :is-group-manager? false
              :user-id           (mt/user->id :lucky)
              :user              {:id    (mt/user->id :lucky)
                                  :email (:email (mt/fetch-user :lucky))}}
             (simple-auth-handler {:headers {"x-api-key" "mb_foobar"}}))))
    (testing "A superuser API key has `*is-superuser?*` bound correctly"
      (is (= {:is-superuser?     true
              :is-group-manager? false
              :user-id           (mt/user->id :crowberto)
              :user              {:id    (mt/user->id :crowberto)
                                  :email (:email (mt/fetch-user :crowberto))}}
             (simple-auth-handler {:headers {"x-api-key" "mb_superuser"}}))))))

(deftest current-user-info-for-session-test
  (testing "make sure the `current-user-info-for-session` logic is working correctly"
    ;; for some reason Toucan seems to be busted with models with non-integer IDs and `with-temp` doesn't seem to work
    ;; the way we'd expect :/
    (try
      (t2/insert! Session {:id (str test-uuid), :user_id (mt/user->id :lucky)})
      (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! Session :id (str test-uuid)))))

  (testing "superusers should come back as `:is-superuser?`"
    (try
      (t2/insert! Session {:id (str test-uuid), :user_id (mt/user->id :crowberto)})
      (is (= {:metabase-user-id (mt/user->id :crowberto), :is-superuser? true, :is-group-manager? false, :user-locale nil}
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! Session :id (str test-uuid)))))

  (testing "If user is a group manager of at least one group, `:is-group-manager?` "
    (try
      (mt/with-user-in-groups [group-1 {:name "New Group 1"}
                               group-2 {:name "New Group 2"}
                               user    [group-1 group-2]]
        (t2/update! PermissionsGroupMembership {:user_id (:id user), :group_id (:id group-2)}
                    {:is_group_manager true})
        (t2/insert! Session {:id      (str test-uuid)
                             :user_id (:id user)})
        (testing "is `false` if advanced-permisison is disabled"
          (mt/with-premium-features #{}
            (is (= false
                   (:is-group-manager? (#'mw.session/current-user-info-for-session (str test-uuid) nil))))))

        (testing "is `true` if advanced-permisison is enabled"
          ;; a trick to run this test in OSS because even if advanced-permisison is enabled but EE ns is not evailable
          ;; `enable-advanced-permissions?` will still return false
          (with-redefs [premium-features/enable-advanced-permissions? (fn [& _args] true)]
            (is (= true
                   (:is-group-manager? (#'mw.session/current-user-info-for-session (str test-uuid) nil)))))))
      (finally
        (t2/delete! Session :id (str test-uuid)))))

  (testing "full-app-embed sessions shouldn't come back if we don't explicitly specifiy the anti-csrf token"
    (try
      (t2/insert! Session {:id              (str test-uuid)
                           :user_id         (mt/user->id :lucky)
                           :anti_csrf_token test-anti-csrf-token})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! Session :id (str test-uuid))))

    (testing "...but if we do specifiy the token, they should come back"
      (try
        (t2/insert! Session {:id              (str test-uuid)
                             :user_id         (mt/user->id :lucky)
                             :anti_csrf_token test-anti-csrf-token})
        (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token)))
        (finally
          (t2/delete! Session :id (str test-uuid))))

      (testing "(unless the token is wrong)"
        (try
          (t2/insert! Session {:id              (str test-uuid)
                               :user_id         (mt/user->id :lucky)
                               :anti_csrf_token test-anti-csrf-token})
          (is (= nil
                 (#'mw.session/current-user-info-for-session (str test-uuid) (str/join (reverse test-anti-csrf-token)))))
          (finally
            (t2/delete! Session :id (str test-uuid)))))))

  (testing "if we specify an anti-csrf token we shouldn't get back a session without that token"
    (try
      (t2/insert! Session {:id      (str test-uuid)
                           :user_id (mt/user->id :lucky)})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token)))
      (finally
        (t2/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch expired sessions"
    (try
      (t2/insert! Session {:id      (str test-uuid)
                           :user_id (mt/user->id :lucky)})
        ;; use low-level `execute!` because updating is normally disallowed for Sessions
      (t2/query-one {:update :core_session, :set {:created_at (t/instant 1000)}, :where [:= :id (str test-uuid)]})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! Session :id (str test-uuid)))))

  (testing "shouldn't fetch sessions for inactive users"
    (try
      (t2/insert! Session {:id (str test-uuid), :user_id (mt/user->id :trashbird)})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! Session :id (str test-uuid))))))

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

(deftest ^:parallel add-user-id-key-test
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


;;; ----------------------------------------------   with-current-user -------------------------------------------------

(deftest with-current-user-test
  (testing "with-current-user correctly binds the appropriate vars for the provided user ID"
    (mw.session/with-current-user (mt/user->id :rasta)
      ;; Set a user-local value for rasta so that we can make sure that the user-local settings map is correctly bound
      (setting-test/test-user-local-only-setting! "XYZ")

      (is (= (mt/user->id :rasta) *current-user-id*))
      (is (= "rasta@metabase.com" (:email @*current-user*)))
      (is (false? api/*is-superuser?*))
      (is (= nil i18n/*user-locale*))
      (is (false? api/*is-group-manager?*))
      (is (= (user/permissions-set (mt/user->id :rasta)) @api/*current-user-permissions-set*))
      (is (partial= {:test-user-local-only-setting "XYZ"} @@setting/*user-local-values*)))))

(deftest as-admin-test
  (testing "as-admin overrides *is-superuser?* and *current-user-permissions-set*"
    (mw.session/with-current-user (mt/user->id :rasta)
      (mw.session/as-admin
       ;; Current user ID remains the same
       (is (= (mt/user->id :rasta) *current-user-id*))
       ;; *is-superuser?* and permissions set are overrided
       (is (true? api/*is-superuser?*))
       (is (= #{"/"} @api/*current-user-permissions-set*))))))


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
        (t2.with-temp/with-temp [User {user-id :id}]
          (let [session-id (str (random-uuid))]
            (t2/insert! Session {:id session-id, :user_id user-id})
            (is (= nil
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "es_MX"
                     (session-locale session-id :headers {"x-metabase-locale" "es-mx"})))))))

      (testing "for user *with* `:locale`"
        (t2.with-temp/with-temp [User {user-id :id} {:locale "es-MX"}]
          (let [session-id (str (random-uuid))]
            (t2/insert! Session {:id session-id, :user_id user-id, :created_at :%now})
            (is (= "es_MX"
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "en_GB"
                     (session-locale session-id :headers {"x-metabase-locale" "en-GB"}))))))))))


;;; ----------------------------------------------------- Session timeout -----------------------------------------------------

(deftest session-timeout-validation-test
  (testing "Setting the session timeout should fail if the timeout isn't positive"
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout amount must be positive"
         (mw.session/session-timeout! {:unit "hours", :amount 0})))
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout amount must be positive"
         (mw.session/session-timeout! {:unit "minutes", :amount -1}))))
  (testing "Setting the session timeout should fail if the timeout is too large"
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout must be less than 100 years"
         (mw.session/session-timeout! {:unit "hours", :amount (* 100 365.25 24)})))
    (is (thrown-with-msg?
         java.lang.Exception
         #"Session timeout must be less than 100 years"
         (mw.session/session-timeout! {:unit "minutes", :amount (* 100 365.25 24 60)}))))
  (testing "Setting the session timeout shouldn't fail if the timeout is between 0 and 100 years exclusive"
    (is (some? (mw.session/session-timeout! {:unit "minutes", :amount 1})))
    (is (some? (mw.session/session-timeout! {:unit "hours", :amount 1})))
    (is (some? (mw.session/session-timeout! {:unit "minutes", :amount (dec (* 100 365.25 24 60))})))
    (is (some? (mw.session/session-timeout! {:unit "hours", :amount (dec (* 100 365.25 24))}))))
  (testing "Setting an invalid timeout via PUT /api/setting/:key endpoint should return a 400 status code"
    (is (= "Session timeout amount must be positive."
           (mt/user-http-request :crowberto :put 400 "setting/session-timeout" {:value {:unit "hours", :amount -1}})))))

(deftest session-timeout-env-var-validation-test
  (let [set-and-get (fn [timeout]
                      (mt/with-temp-env-var-value! [mb-session-timeout (json/generate-string timeout)]
                        (mw.session/session-timeout)))]
    (testing "Setting the session timeout with env var should work with valid timeouts"
      (doseq [timeout [{:unit "hours", :amount 1}
                       {:unit "hours", :amount (dec (* 100 365.25 24))}]]
        (is (= timeout
               (set-and-get timeout)))))
    (testing "Setting the session timeout via the env var should fail if the timeout isn't positive"
      (doseq [amount [0 -1]
              :let [timeout {:unit "hours", :amount amount}]]
        (is (nil? (set-and-get timeout)))
        (is (= [[:warn nil "Session timeout amount must be positive."]]
               (mt/with-log-messages-for-level :warn (set-and-get timeout))))))
    (testing "Setting the session timeout via env var should fail if the timeout is too large"
      (doseq [timeout [{:unit "hours", :amount (* 100 365.25 24)}
                       {:unit "minutes", :amount (* 100 365.25 24 60)}]]
        (is (nil? (set-and-get timeout)))
        (is (= [[:warn nil "Session timeout must be less than 100 years."]]
               (mt/with-log-messages-for-level :warn (set-and-get timeout))))))))

(deftest session-timeout-test
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

    (testing "non-nil `session-timeout-seconds` should set the expiry of the timeout cookie relative to the request time"
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (testing "with normal sessions"
          (let [request {:cookies               {session-cookie         {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 session-timeout-cookie {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :normal}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :same-site :lax
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))

        (testing "with embedded sessions"
          (let [request {:cookies               {embedded-session-cookie {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 session-timeout-cookie  {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :full-app-embed}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))))

    (testing "If the request does not have session cookies (because they have expired), they should not be reset."
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (let [request {:cookies {}}]
          (is (= response
                 (mw.session/reset-session-timeout* request response request-time))))))

    (testing "If [[public-settings/session-cookies]] is false and the `:remember` flag is set, then the session cookie
              should have a max age attribute."
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
                   (mw.session/set-session-cookies request response session request-time)))))))

    (testing "If [[public-settings/session-cookies]] is true and the `:remember` flag is set, then the session cookie
              shouldn't have a max age attribute."
      (with-redefs [env/env (assoc env/env :max-session-age "1")]
        (mt/with-temporary-setting-values [session-timeout nil
                                           public-settings/session-cookies true]
          (let [request {:metabase-session-id   session-id
                         :metabase-session-type :normal
                         :remember              "true"
                         :cookies               {session-cookie         {:value "session-id"}
                                                 session-timeout-cookie {:value "alive"}}}
                session {:id   session-id
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
                   (mw.session/set-session-cookies request response session request-time)))))))))
