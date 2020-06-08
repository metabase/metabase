(ns metabase.middleware.session-test
  (:require [clojure.test :refer :all]
            [environ.core :as env]
            [expectations :refer [expect]]
            [metabase
             [db :as mdb]
             [models :refer [Session User]]
             [test :as mt]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.middleware.session :as mw.session]
            [metabase.test.data.users :as test-users]
            [metabase.util.i18n :as i18n]
            [ring.mock.request :as mock]
            [toucan.db :as db])
  (:import java.util.UUID))

(deftest set-session-cookie-test
  (let [uuid (UUID/randomUUID)]
    (testing "should unset the old SESSION_ID if it's present"
      (is (= {"metabase.SESSION_ID"
              {:value   nil
               :expires "Thu, 1 Jan 1970 00:00:00 GMT"
               :path    "/"}
              "metabase.SESSION"
              {:value     (str uuid)
               :same-site :lax
               :http-only true
               :path      "/"
               :max-age   1209600}}
             (-> (mw.session/set-session-cookie {} {} uuid)
                 :cookies))))
    (testing "if `MB_SESSION_COOKIES=true` we shouldn't set a `Max-Age`"
      (is (= {:value     (str uuid)
              :same-site :lax
              :http-only true
              :path      "/"}
             (let [env env/env]
               (with-redefs [env/env (assoc env :mb-session-cookies "true")]
                 (-> (mw.session/set-session-cookie {} {} uuid)
                     (get-in [:cookies "metabase.SESSION"])))))))))

;; if request is an HTTPS request then we should set `:secure true`. There are several different headers we check for
;; this. Make sure they all work.
(deftest secure-cookie-test
  (doseq [[headers expected] [[{"x-forwarded-proto" "https"} true]
                              [{"x-forwarded-proto" "http"} false]
                              [{"x-forwarded-protocol" "https"} true]
                              [{"x-forwarded-protocol" "http"} false]
                              [{"x-url-scheme" "https"} true]
                              [{"x-url-scheme" "http"} false]
                              [{"x-forwarded-ssl" "on"} true]
                              [{"x-forwarded-ssl" "off"} false]
                              [{"front-end-https" "on"} true]
                              [{"front-end-https" "off"} false]
                              [{"origin" "https://mysite.com"} true]
                              [{"origin" "http://mysite.com"} false]]]
    (let [actual (-> (mw.session/set-session-cookie {:headers headers} {} (UUID/randomUUID))
                     (get-in [:cookies "metabase.SESSION" :secure])
                     boolean)]
      (is (= expected
             actual)
          (format "With headers %s we %s set the 'secure' attribute on the session cookie"
                  (pr-str headers) (if expected "SHOULD" "SHOULD NOT"))))))

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
              (let [session (#'mw.session/current-user-info-for-session session-id)]
                (if expected
                  (is (= nil
                         session))
                  (is (some? session)))))))))))


;;; ---------------------------------------- TEST wrap-session-id middleware -----------------------------------------

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
    (mock/header (mock/request :get "/anyurl") @#'mw.session/metabase-session-header "foobar"))))


;; extract session-id from cookie
(expect
  "cookie-session"
  (:metabase-session-id
   (wrapped-handler
    (assoc (mock/request :get "/anyurl")
      :cookies {@#'mw.session/metabase-session-cookie {:value "cookie-session"}}))))


;; if both header and cookie session-ids exist, then we expect the cookie to take precedence
(expect
  "cookie-session"
  (:metabase-session-id
   (wrapped-handler
    (assoc (mock/header (mock/request :get "/anyurl") @#'mw.session/metabase-session-header "foobar")
      :cookies {@#'mw.session/metabase-session-cookie {:value "cookie-session"}}))))


;;; --------------------------------------- TEST bind-current-user middleware ----------------------------------------

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
