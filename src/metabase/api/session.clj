(ns metabase.api.session
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes POST DELETE]]
            [metabase.db :refer :all]
            (metabase.models [user :refer [User]]
                             [session :refer [Session]])))


(defendpoint POST "/" [:as {{:keys [email password] :as body} :body}]
  (check (and email password) [400 "You must supply email & password credentials to login"])
  (let-400 [user (sel :one [User :id :password] :email email)]
    ;; TODO - password validation via encryption
    (check (= password (:password user)) [400 "password mismatch"])
    (let [session-id (str (java.util.UUID/randomUUID))]
      (ins Session
        :id session-id
        :user_id (:id user))
      {:id session-id})))


(defendpoint DELETE "/" [:as {params :params}]
  (let [session_id (:session_id params)]
    (check-400 session_id)
    (let-400 [session (sel :one Session :id session_id)]
      (del Session :id session_id))))


(define-routes)
