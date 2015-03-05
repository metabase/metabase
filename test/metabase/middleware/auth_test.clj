(ns metabase.middleware.auth-test
  (:require [expectations :refer :all]
            [korma.core :as korma]
            [metabase.middleware.auth :refer :all]
            [metabase.models.session :refer [Session]]
            [metabase.test-data :as test-data]
            [metabase.util :as util]
            [ring.mock.request :as mock]))


;;;;  ===========================  TEST wrap-sessionid middleware  ===========================


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


;;;;  ===========================  TEST enforce-authentication middleware  ===========================


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
(let [sessionid (.toString (java.util.UUID/randomUUID))
      user-id (test-data/user->id :rasta)]
  (assert sessionid)
  (assert user-id)
  ;; create a new session
  (korma/insert Session (korma/values {:id sessionid :user_id user-id :created_at (util/new-sql-timestamp)}))
  ;; validate that we are authenticated
  (expect
    {:metabase-userid user-id}
    (-> (auth-enforced-handler (request-with-sessionid sessionid))
      (select-keys [:metabase-userid]))))


;;; expired sessionid
(let [sessionid (.toString (java.util.UUID/randomUUID))
      user-id (test-data/user->id :rasta)]
  (assert sessionid)
  (assert user-id)
  ;; create a new session (specifically created some time in the past so it's EXPIRED)
  (korma/insert Session (korma/values {:id sessionid :user_id user-id :created_at (java.sql.Timestamp. 0)}))
  ;; should fail due to session expiration
  (expect
    {:status (:status response-unauthentic)
     :body (:body response-unauthentic)}
    (auth-enforced-handler (request-with-sessionid sessionid))))


;;; inactive user sessionid
(let [sessionid (.toString (java.util.UUID/randomUUID))
      user-id (test-data/user->id :trashbird)]              ; NOTE that :trashbird is our INACTIVE test user
  (assert sessionid)
  (assert user-id)
  ;; create a new session (specifically created some time in the past so it's EXPIRED)
  (korma/insert Session (korma/values {:id sessionid :user_id user-id :created_at (util/new-sql-timestamp)}))
  ;; should fail due to inactive user
  (expect
    {:status (:status response-unauthentic)
     :body (:body response-unauthentic)}
    (auth-enforced-handler (request-with-sessionid sessionid))))