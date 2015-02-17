(ns metabase.api.session
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes POST DELETE]]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User]]
                             [session :refer [Session]])))


(defendpoint POST "/" [:as {body :body}]
  (if-not (and (contains? body :email) (contains? body :password))
    {:status 400 :body "You must supply email & password credentials to login"}
    (api-let [400 "Invalid username/password combination"] [user (sel :one User :email (:email body))]
      ;; TODO - password validation via encryption
      ; (check-400 (= (:password body) (:password user)))
      (let [session-id (str (java.util.UUID/randomUUID))]
        (ins Session
          :id session-id
          :user_id (:id user)
          :created_at (new java.util.Date))
        ;; TODO - figure out how to apply session to client.  cookies??
        {:id session-id}))))


(defendpoint DELETE "/" [:as {body :body}]
  (if-not (contains? body :session_id)
    {:status 400 :body "You must supply a session_id"}
    (api-let [400 "Invalid session"] [session (sel :one Session :id (:session_id body))]
      (del Session :id (:session_id body)))))
;; TODO - do we need to remove any cookies??


(define-routes)
