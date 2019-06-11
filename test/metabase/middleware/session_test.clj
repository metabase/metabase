(ns metabase.middleware.session-test
  (:require [environ.core :as env]
            [expectations :refer [expect]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.middleware.session :as mw.session]
            [metabase.test.data.users :as test-users]
            [ring.mock.request :as mock])
  (:import java.util.UUID
           org.joda.time.DateTime))

;;; ----------------------------------------------- set-session-cookie -----------------------------------------------

;; let's see whether we can set a Session cookie using the default options
(let [uuid (UUID/randomUUID)]
  (expect
    ;; should unset the old SESSION_ID if it's present
    {"metabase.SESSION_ID"
     {:value   nil
      :expires (DateTime. 0)
      :path    "/"}
     "metabase.SESSION"
     {:value     (str uuid)
      :same-site :lax
      :http-only true
      :path      "/"
      :max-age   1209600}}
    (-> (mw.session/set-session-cookie {} {} uuid)
        :cookies)))

;; if `MB_SESSION_COOKIES=true` we shouldn't set a `Max-Age`
(let [uuid (UUID/randomUUID)]
  (expect
    {:value     (str uuid)
     :same-site :lax
     :http-only true
     :path      "/"}
    (let [env env/env]
      (with-redefs [env/env (assoc env :mb-session-cookies "true")]
        (-> (mw.session/set-session-cookie {} {} uuid)
            (get-in [:cookies "metabase.SESSION"]))))))

;; if request is an HTTPS request then we should set `:secure true`. There are several different headers we check for
;; this. Make sure they all work.
(defn- secure-cookie-for-headers? [headers]
  (-> (mw.session/set-session-cookie {:headers headers} {} (UUID/randomUUID))
      (get-in [:cookies "metabase.SESSION" :secure])
      boolean))

(expect true  (secure-cookie-for-headers? {"x-forwarded-proto" "https"}))
(expect false (secure-cookie-for-headers? {"x-forwarded-proto" "http"}))

(expect true  (secure-cookie-for-headers? {"x-forwarded-protocol" "https"}))
(expect false (secure-cookie-for-headers? {"x-forwarded-protocol" "http"}))

(expect true  (secure-cookie-for-headers? {"x-url-scheme" "https"}))
(expect false (secure-cookie-for-headers? {"x-url-scheme" "http"}))

(expect true  (secure-cookie-for-headers? {"x-forwarded-ssl" "on"}))
(expect false (secure-cookie-for-headers? {"x-forwarded-ssl" "off"}))

(expect true  (secure-cookie-for-headers? {"front-end-https" "on"}))
(expect false (secure-cookie-for-headers? {"front-end-https" "off"}))

(expect true  (secure-cookie-for-headers? {"origin" "https://mysite.com"}))
(expect false (secure-cookie-for-headers? {"origin" "http://mysite.com"}))


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
