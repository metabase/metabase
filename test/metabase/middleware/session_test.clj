(ns metabase.middleware.session-test
  (:require [clojure.test :refer :all]
            [environ.core :as env]
            [expectations :refer [expect]]
            [java-time :as t]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.middleware.session :as mw.session]
            [metabase.test.data.users :as test-users]
            [ring.mock.request :as mock])
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
    (doseq [[created-at expected msg]
            [[nil                                              true  "nil created-at"]
             [(t/offset-date-time)                             false "brand-new session"]
             [#t "1970-01-01T00:00:00Z"                        true  "really old session"]
             [(t/instant (- (System/currentTimeMillis) 61000)) true  "session that is 61 seconds old"]
             [(t/instant (- (System/currentTimeMillis) 59000)) false "session that is 59 seconds old"]]]
      (is (= expected
             (#'mw.session/session-expired? {:created_at created-at} 1))
          (format "%s %s be expired." msg (if expected "SHOULD" "SHOULD NOT"))))))


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
