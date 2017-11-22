(ns metabase.middleware-test
  (:require [cheshire.core :as json]
            [clojure.core.async :as async]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [compojure.core :refer [GET]]
            [expectations :refer :all]
            [metabase
             [config :as config]
             [middleware :as middleware :refer :all]
             [routes :as routes]
             [util :as u]]
            [metabase.api.common :refer [*current-user* *current-user-id*]]
            [metabase.models.session :refer [Session]]
            [metabase.test.data.users :refer :all]
            [ring.mock.request :as mock]
            [ring.util.response :as resp]
            [toucan.db :as db]
            [clojure.string :as string]))

;;  ===========================  TEST wrap-session-id middleware  ===========================

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(def ^:private wrapped-handler
  (wrap-session-id identity))


;; no session-id in the request
(expect nil
  (-> (wrapped-handler (mock/request :get "/anyurl"))
      :metabase-session-id))


;; extract session-id from header
(expect "foobar"
  (:metabase-session-id (wrapped-handler (mock/header (mock/request :get "/anyurl") @(resolve 'metabase.middleware/metabase-session-header) "foobar"))))


;; extract session-id from cookie
(expect "cookie-session"
  (:metabase-session-id (wrapped-handler (assoc (mock/request :get "/anyurl") :cookies {@(resolve 'metabase.middleware/metabase-session-cookie) {:value "cookie-session"}}))))


;; if both header and cookie session-ids exist, then we expect the cookie to take precedence
(expect "cookie-session"
  (:metabase-session-id (wrapped-handler (assoc (mock/header (mock/request :get "/anyurl") @(resolve 'metabase.middleware/metabase-session-header) "foobar")
                                                :cookies {@(resolve 'metabase.middleware/metabase-session-cookie) {:value "cookie-session"}}))))


;;  ===========================  TEST enforce-authentication middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns the request
(def ^:private auth-enforced-handler
  (wrap-current-user-id (enforce-authentication identity)))


(defn- request-with-session-id
  "Creates a mock Ring request with the given session-id applied"
  [session-id]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-session-id session-id)))


;; no session-id in the request
(expect response-unauthentic
  (auth-enforced-handler (mock/request :get "/anyurl")))

(defn- random-session-id []
  (str (java.util.UUID/randomUUID)))


;; valid session ID
(expect
  (user->id :rasta)
  (let [session-id (random-session-id)]
    (db/simple-insert! Session, :id session-id, :user_id (user->id :rasta), :created_at (u/new-sql-timestamp))
    (-> (auth-enforced-handler (request-with-session-id session-id))
        :metabase-user-id)))


;; expired session-id
;; create a new session (specifically created some time in the past so it's EXPIRED)
;; should fail due to session expiration
(expect
  response-unauthentic
  (let [session-id (random-session-id)]
    (db/simple-insert! Session, :id session-id, :user_id (user->id :rasta), :created_at (java.sql.Timestamp. 0))
    (auth-enforced-handler (request-with-session-id session-id))))


;; inactive user session-id
;; create a new session (specifically created some time in the past so it's EXPIRED)
;; should fail due to inactive user
;; NOTE that :trashbird is our INACTIVE test user
(expect response-unauthentic
  (let [session-id (random-session-id)]
    (db/simple-insert! Session, :id session-id, :user_id (user->id :trashbird), :created_at (u/new-sql-timestamp))
    (auth-enforced-handler (request-with-session-id session-id))))


;;  ===========================  TEST bind-current-user middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns our bound variables for users
(def ^:private user-bound-handler
  (bind-current-user (fn [_] {:user-id *current-user-id*
                              :user    (select-keys @*current-user* [:id :email])})))

(defn- request-with-user-id
  "Creates a mock Ring request with the given user-id applied"
  [user-id]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-user-id user-id)))


;; with valid user-id
(expect
    {:user-id (user->id :rasta)
     :user    {:id    (user->id :rasta)
               :email (:email (fetch-user :rasta))}}
  (user-bound-handler (request-with-user-id (user->id :rasta))))

;; with invalid user-id (not sure how this could ever happen, but lets test it anyways)
(expect
    {:user-id 0
     :user    {}}
  (user-bound-handler (request-with-user-id 0)))


;;  ===========================  TEST wrap-api-key middleware  ===========================

;; create a simple example of our middleware wrapped around a handler that simply returns the request
;; this works in this case because the only impact our middleware has is on the request
(def ^:private wrapped-api-key-handler
  (wrap-api-key identity))


;; no apikey in the request
(expect nil
  (:metabase-session-id (wrapped-api-key-handler (mock/request :get "/anyurl"))))


;; extract apikey from header
(expect "foobar"
  (:metabase-api-key (wrapped-api-key-handler (mock/header (mock/request :get "/anyurl") @(resolve 'metabase.middleware/metabase-api-key-header) "foobar"))))


;;  ===========================  TEST enforce-api-key middleware  ===========================


;; create a simple example of our middleware wrapped around a handler that simply returns the request
(def ^:private api-key-enforced-handler
  (enforce-api-key (constantly {:success true})))


(defn- request-with-api-key
  "Creates a mock Ring request with the given apikey applied"
  [api-key]
  (-> (mock/request :get "/anyurl")
      (assoc :metabase-api-key api-key)))


;; no apikey in the request, expect 403
(expect response-forbidden
  (api-key-enforced-handler (mock/request :get "/anyurl")))


;; valid apikey, expect 200
(expect
    {:success true}
  (api-key-enforced-handler (request-with-api-key "test-api-key")))


;; invalid apikey, expect 403
(expect response-forbidden
  (api-key-enforced-handler (request-with-api-key "foobar")))


;;; JSON encoding tests

;; Check that we encode byte arrays as the hex values of their first four bytes
(expect "{\"my-bytes\":\"0xC42360D7\"}"
        (json/generate-string {:my-bytes (byte-array [196 35  96 215  8 106 108 248 183 215 244 143  17 160 53 186
                                                      213 30 116  25 87  31 123 172 207 108  47 107 191 215 76  92])}))
;;; stuff here

(defn- streaming-fast-success [_]
  (resp/response {:success true}))

(defn- streaming-fast-failure [_]
  (throw (Exception. "immediate failure")))

(defn- streaming-slow-success [_]
  (Thread/sleep 7000)
  (resp/response {:success true}))

(defn- streaming-slow-failure [_]
  (Thread/sleep 7000)
  (throw (Exception. "delayed failure")))

(defn- test-streaming-endpoint [handler]
  (let [path (str handler)]
    (with-redefs [metabase.routes/routes (compojure.core/routes
                                          (GET (str "/" path) [] (middleware/streaming-json-response
                                                                  handler)))]
      (let  [connection (async/chan 1000)
             reader (io/input-stream (str "http://localhost:" (config/config-int :mb-jetty-port) "/" path))]
        (async/go-loop [next-char (.read reader)]
          (if (pos? next-char)
            (do
              (async/>! connection (char next-char))
              (recur (.read reader)))
            (async/close! connection)))
        (let [_ (Thread/sleep 1500)
              first-second (async/poll! connection)
              _ (Thread/sleep 1000)
              second-second (async/poll! connection)
              eventually (apply str (async/<!! (async/into [] connection)))]
          [first-second second-second (string/trim eventually)])))))

(comment
;;slow success
(expect
  [\newline \newline "{\"success\":true}"]
  (test-streaming-endpoint streaming-slow-success))

;; immediate success should have no padding
(expect
  [\{ \" "success\":true}"]
  (test-streaming-endpoint streaming-fast-success))

;; we know delayed failures (exception thrown) will just drop the connection
(expect
  [\newline \newline ""]
  (test-streaming-endpoint streaming-slow-failure))

;; immediate failures (where an exception is thown will return a 500
(expect
  #"Server returned HTTP response code: 500 for URL:.*"
  (try
    (test-streaming-endpoint streaming-fast-failure)
    (catch java.io.IOException e
      (.getMessage e))))
)
;; test that handler is killed when connection closes
;; Note: this closing over state is a dirty hack and the whole test should be
;; rewritten.

(defn- test-slow-handler [state]
  (fn [_]
    (log/debug (u/format-color 'yellow "starting test-slow-handler"))
    (reset! state :test-started)
    (Thread/sleep 7000)  ;; this is somewhat long to make sure the keepalive polling has time to kill it.
    (reset! state :ran-to-compleation)
    (log/debug (u/format-color 'yellow "finished test-slow-handler"))
    (resp/response {:success true})))

(defn- start-and-maybe-kill-test-request [state kill?]
  (reset! state :initial-state)
  (let [path "test-slow-handler"]
    (with-redefs [metabase.routes/routes (compojure.core/routes
                                          (GET (str "/" path) [] (middleware/streaming-json-response
                                                                  (test-slow-handler state))))]
      (let  [reader (io/input-stream (str "http://localhost:" (config/config-int :mb-jetty-port) "/" path))]
        (while (= :initial-state @state))
        (when kill?
          (.close reader))
        (Thread/sleep 10000)))) ;; this is long enough to ensure that the handler has run to completion if it was not killed.
  @state)

;; In this first test we will close the connection before the test handler gets to change the state
(expect
  :test-started
  (start-and-maybe-kill-test-request (atom :unset) true))

;; and to make sure this test actually works, run the same test again and let it change the state.
(expect
  :ran-to-compleation
  (start-and-maybe-kill-test-request (atom :unset) false))
