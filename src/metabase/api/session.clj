(ns metabase.api.session
  (:require [cemerick.friend.credentials :as creds]
            [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes POST DELETE]]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User]]
                             [session :refer [Session]])))


(defendpoint POST "/" [:as {{:keys [email password] :as body} :body}]
  (require-params email password)
  (let-400 [user (sel :one [User :id :password] :email email)]
    (check (creds/bcrypt-verify password (:password user)) [400 "password mismatch"])
    (let [session-id (str (java.util.UUID/randomUUID))]
      (ins Session
        :id session-id
        :user_id (:id user))
      {:id session-id})))


(defendpoint DELETE "/" [:as {{:keys [session_id]} :params}]
  (check-400 session_id)
  (check-400 (exists? Session :id session_id))
  (del Session :id session_id))


(define-routes)
