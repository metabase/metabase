(ns metabase.middleware.auth-test
  (:require [expectations :refer :all]
            [korma.core :as korma]
            [ring.mock.request :as mock]
            [metabase.api.common :refer [*current-user-id* *current-user*]]
            [metabase.middleware.auth :refer :all]
            [metabase.models.session :refer [Session]]
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.util :as util]))

;;  ===========================  TEST wrap-sessionid middleware  ===========================

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(def wrapped-handler
  (wrap-sessionid (fn [req] req)))


;; no sessionid in the request
(expect
  {}
  (-> (wrapped-handler (mock/request :get "/anyurl") )
      (select-keys [:metabase-sessionid])))


;; extract sessionid from header
(expect
  {:metabase-sessionid "foobar"}
  (-> (wrapped-handler (mock/header (mock/request :get "/anyurl") metabase-session-header "foobar"))
      (select-keys [:metabase-sessionid])))


;; extract sessionid from cookie
(expect
  {:metabase-sessionid "cookie-session"}
  (-> (wrapped-handler (assoc (mock/request :get "/anyurl") :cookies {metabase-session-cookie {:value "cookie-session"}}))
      (select-keys [:metabase-sessionid])))


;; if both header and cookie sessionids exist, then we expect the cookie to take precedence
(expect
  {:metabase-sessionid "cookie-session"}
  (-> (wrapped-handler (-> (mock/header (mock/request :get "/anyurl") metabase-session-header "foobar")
                           (assoc :cookies {metabase-session-cookie {:value "cookie-session"}})))
      (select-keys [:metabase-sessionid])))


;;  ===========================  TEST enforce-authentication middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns the request
(def auth-enforced-handler
  (enforce-authentication (fn [req] req)))


(defn request-with-sessionid
  "Creates a mock Ring request with the given sessionid applied"
  [sessionid]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-sessionid sessionid)))


;; no sessionid in the request
(expect
  {:status (:status response-unauthentic)
   :body (:body response-unauthentic)}
  (auth-enforced-handler (mock/request :get "/anyurl")))


;; valid sessionid
(let [sessionid (.toString (java.util.UUID/randomUUID))]
  (assert sessionid)
  ;; validate that we are authenticated
  (expect-let [res (korma/insert Session (korma/values {:id sessionid :user_id (user->id :rasta) :created_at (util/new-sql-timestamp)}))]
    {:metabase-userid (user->id :rasta)}
    (-> (auth-enforced-handler (request-with-sessionid sessionid))
        (select-keys [:metabase-userid]))))


;; expired sessionid
(let [sessionid (.toString (java.util.UUID/randomUUID))]
  (assert sessionid)
  ;; create a new session (specifically created some time in the past so it's EXPIRED)
  ;; should fail due to session expiration
  (expect-let [res (korma/insert Session (korma/values {:id sessionid :user_id (user->id :rasta) :created_at (java.sql.Timestamp. 0)}))]
    {:status (:status response-unauthentic)
     :body (:body response-unauthentic)}
    (auth-enforced-handler (request-with-sessionid sessionid))))


;; inactive user sessionid
(let [sessionid (.toString (java.util.UUID/randomUUID))]
  (assert sessionid)
  ;; create a new session (specifically created some time in the past so it's EXPIRED)
  ;; should fail due to inactive user
  ;; NOTE that :trashbird is our INACTIVE test user
  (expect-let [res (korma/insert Session (korma/values {:id sessionid :user_id (user->id :trashbird) :created_at (util/new-sql-timestamp)}))]
    {:status (:status response-unauthentic)
     :body (:body response-unauthentic)}
    (auth-enforced-handler (request-with-sessionid sessionid))))


;;  ===========================  TEST bind-current-user middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns our bound variables for users
(def user-bound-handler
  (bind-current-user (fn [req] {:userid *current-user-id*
                                :user (select-keys @*current-user* [:id :email])})))


(defn request-with-userid
  "Creates a mock Ring request with the given userid applied"
  [userid]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-userid userid)))


;; with valid user-id
(expect
  {:userid (user->id :rasta)
   :user {:id (user->id :rasta)
          :email (:email (fetch-user :rasta))}}
  (user-bound-handler (request-with-userid (user->id :rasta))))

;; with invalid user-id (not sure how this could ever happen, but lets test it anyways)
(expect
  {:userid 0
   :user {}}
  (user-bound-handler (request-with-userid 0)))


;;  ===========================  TEST wrap-apikey middleware  ===========================

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(def wrapped-apikey-handler
  (wrap-apikey (fn [req] req)))


;; no apikey in the request
(expect
  {}
  (-> (wrapped-apikey-handler (mock/request :get "/anyurl") )
      (select-keys [:metabase-sessionid])))


;; extract apikey from header
(expect
  {:metabase-apikey "foobar"}
  (-> (wrapped-apikey-handler (mock/header (mock/request :get "/anyurl") metabase-apikey-header "foobar"))
      (select-keys [:metabase-apikey])))


;;  ===========================  TEST enforce-apikey middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns the request
(def apikey-enforced-handler
  (enforce-apikey (fn [req] {:success true})))


(defn request-with-apikey
  "Creates a mock Ring request with the given apikey applied"
  [apikey]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-apikey apikey)))


;; no apikey in the request, expect 403
(expect
  {:status (:status response-forbidden)
   :body (:body response-forbidden)}
  (apikey-enforced-handler (mock/request :get "/anyurl")))


;; valid apikey, expect 200
(expect
  {:success true}
  (apikey-enforced-handler (request-with-apikey "test-api-key")))


;; invalid apikey, expect 403
(expect
  {:status (:status response-forbidden)
   :body (:body response-forbidden)}
  (apikey-enforced-handler (request-with-apikey "foobar")))
