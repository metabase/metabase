(ns metabase.server.middleware.session-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [environ.core :as env]
   [java-time.api :as t]
   [metabase.api.common :refer [*current-user* *current-user-id* *is-group-manager?* *is-superuser?*]]
   [metabase.core.initialization-status :as init-status]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]
   [metabase.util.secret :as u.secret]
   [ring.mock.request :as ring.mock]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private session-cookie request/metabase-session-cookie)
(def ^:private session-timeout-cookie request/metabase-session-timeout-cookie)

(def ^:private test-uuid #uuid "092797dd-a82a-4748-b393-697d7bb9ab65")

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
          (mt/with-temp [:model/User {user-id :id}]
            (let [session-id (str (random-uuid))]
              (t2/insert! (t2/table-name :model/Session) {:id session-id, :user_id user-id, :created_at created-at})
              (let [session (#'mw.session/current-user-info-for-session session-id nil)]
                (if expected
                  (is (nil? session))
                  (is (some? session)))))))))))

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

(def ^:private test-anti-csrf-token "84482ddf1bb178186ed9e1c0b1e05a2d")

(deftest ^:parallel anti-csrf-headers-test
  (testing "`wrap-session-id` should handle anti-csrf headers they way we'd expect"
    (let [request (-> (ring.mock/request :get "/anyurl")
                      (assoc :cookies {request/metabase-embedded-session-cookie {:value (str test-uuid)}})
                      (assoc-in [:headers request/anti-csrf-token-header] test-anti-csrf-token))]
      (is (= {:anti-csrf-token     "84482ddf1bb178186ed9e1c0b1e05a2d"
              :cookies             {request/metabase-embedded-session-cookie {:value "092797dd-a82a-4748-b393-697d7bb9ab65"}}
              :metabase-session-id "092797dd-a82a-4748-b393-697d7bb9ab65"
              :uri                 "/anyurl"}
             (select-keys (wrapped-handler request) [:anti-csrf-token :cookies :metabase-session-id :uri]))))))

(deftest current-user-info-for-api-key-test
  (mt/with-temp [:model/ApiKey _ {:name          "An API Key"
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
        {:headers {}})))

  (mt/with-temp [:model/ApiKey _ {:name          "An API Key without an internal user"
                                  :user_id       nil
                                  :creator_id    (mt/user->id :lucky)
                                  :updated_by_id (mt/user->id :lucky)
                                  :unhashed_key  (u.secret/secret "mb_foobar")}]
    (testing "An API key without an internal user (e.g. a SCIM key) should not modify the request"
      (let [req {:headers {"x-api-key" "mb_foobar"}}]
        (is (= req (#'mw.session/merge-current-user-info req)))))))

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
  (mt/with-temp [:model/ApiKey _ {:name          "An API Key"
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
      (t2/insert! :model/Session {:id (str test-uuid), :user_id (mt/user->id :lucky)})
      (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))))

(deftest current-user-info-for-session-test-2
  (testing "superusers should come back as `:is-superuser?`"
    (try
      (t2/insert! :model/Session {:id (str test-uuid), :user_id (mt/user->id :crowberto)})
      (is (= {:metabase-user-id (mt/user->id :crowberto), :is-superuser? true, :is-group-manager? false, :user-locale nil}
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))))

(deftest current-user-info-for-session-test-3
  (testing "If user is a group manager of at least one group, `:is-group-manager?` "
    (try
      (mt/with-user-in-groups [group-1 {:name "New Group 1"}
                               group-2 {:name "New Group 2"}
                               user    [group-1 group-2]]
        (t2/update! :model/PermissionsGroupMembership {:user_id (:id user), :group_id (:id group-2)}
                    {:is_group_manager true})
        (t2/insert! :model/Session {:id      (str test-uuid)
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
        (t2/delete! :model/Session :id (str test-uuid))))))

(deftest current-user-info-for-session-test-4
  (testing "full-app-embed sessions shouldn't come back if we don't explicitly specifiy the anti-csrf token"
    (try
      (t2/insert! :model/Session {:id              (str test-uuid)
                                  :user_id         (mt/user->id :lucky)
                                  :anti_csrf_token test-anti-csrf-token})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))

    (testing "...but if we do specifiy the token, they should come back"
      (try
        (t2/insert! :model/Session {:id              (str test-uuid)
                                    :user_id         (mt/user->id :lucky)
                                    :anti_csrf_token test-anti-csrf-token})
        (is (= {:metabase-user-id (mt/user->id :lucky), :is-superuser? false, :is-group-manager? false, :user-locale nil}
               (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token)))
        (finally
          (t2/delete! :model/Session :id (str test-uuid))))

      (testing "(unless the token is wrong)"
        (try
          (t2/insert! :model/Session {:id              (str test-uuid)
                                      :user_id         (mt/user->id :lucky)
                                      :anti_csrf_token test-anti-csrf-token})
          (is (= nil
                 (#'mw.session/current-user-info-for-session (str test-uuid) (str/join (reverse test-anti-csrf-token)))))
          (finally
            (t2/delete! :model/Session :id (str test-uuid))))))))

(deftest current-user-info-for-session-test-5
  (testing "if we specify an anti-csrf token we shouldn't get back a session without that token"
    (try
      (t2/insert! :model/Session {:id      (str test-uuid)
                                  :user_id (mt/user->id :lucky)})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) test-anti-csrf-token)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))))

(deftest current-user-info-for-session-test-6
  (testing "shouldn't fetch expired sessions"
    (try
      (t2/insert! :model/Session {:id      (str test-uuid)
                                  :user_id (mt/user->id :lucky)})
        ;; use low-level `execute!` because updating is normally disallowed for Sessions
      (t2/query-one {:update :core_session, :set {:created_at (t/instant 1000)}, :where [:= :id (str test-uuid)]})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))))

(deftest current-user-info-for-session-test-7
  (testing "shouldn't fetch sessions for inactive users"
    (try
      (t2/insert! :model/Session {:id (str test-uuid), :user_id (mt/user->id :trashbird)})
      (is (= nil
             (#'mw.session/current-user-info-for-session (str test-uuid) nil)))
      (finally
        (t2/delete! :model/Session :id (str test-uuid))))))

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
        (mt/with-temp [:model/User {user-id :id}]
          (let [session-id (str (random-uuid))]
            (t2/insert! :model/Session {:id session-id, :user_id user-id})
            (is (= nil
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "es_MX"
                     (session-locale session-id :headers {"x-metabase-locale" "es-mx"})))))))

      (testing "for user *with* `:locale`"
        (mt/with-temp [:model/User {user-id :id} {:locale "es-MX"}]
          (let [session-id (str (random-uuid))]
            (t2/insert! :model/Session {:id session-id, :user_id user-id, :created_at :%now})
            (is (= "es_MX"
                   (session-locale session-id)))

            (testing "w/ X-Metabase-Locale header"
              (is (= "en_GB"
                     (session-locale session-id :headers {"x-metabase-locale" "en-GB"}))))))))))

(deftest session-timeout-test
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        session-id   "8df268ab-00c0-4b40-9413-d66b966b696a"
        response     {:body    "some body",
                      :cookies {}}]
    (testing "non-nil `session-timeout-seconds` should set the expiry of the timeout cookie relative to the request time"
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (testing "with normal sessions"
          (let [request {:cookies               {request/metabase-session-cookie         {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 request/metabase-session-timeout-cookie {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :normal}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :same-site :lax
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))

        (testing "with embedded sessions"
          (let [request {:cookies               {request/metabase-embedded-session-cookie {:value "8df268ab-00c0-4b40-9413-d66b966b696a"}
                                                 request/metabase-session-timeout-cookie  {:value "alive"}}
                         :metabase-session-id   session-id
                         :metabase-session-type :full-app-embed}]
            (is (= {:body    "some body",
                    :cookies {session-timeout-cookie {:value     "alive"
                                                      :path      "/"
                                                      :expires   "Sat, 1 Jan 2022 01:00:00 GMT"}}}
                   (mw.session/reset-session-timeout* request response request-time)))))))))

(deftest session-timeout-test-2
  (let [request-time (t/zoned-date-time "2022-01-01T00:00:00.000Z")
        response     {:body    "some body",
                      :cookies {}}]
    (testing "If the request does not have session cookies (because they have expired), they should not be reset."
      (mt/with-temporary-setting-values [session-timeout {:amount 60
                                                          :unit   "minutes"}]
        (let [request {:cookies {}}]
          (is (= response
                 (mw.session/reset-session-timeout* request response request-time))))))))
