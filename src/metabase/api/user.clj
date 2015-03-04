(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET PUT]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer [sel upd exists?]]
            (metabase.models [hydrate :refer [hydrate]]
                             [user :refer [User set-user-password]])
            [metabase.util :refer [is-email? select-non-nil-keys]]))


(defendpoint GET "/" []
  ;; user must be a superuser to proceed
  (check-403 (:is_superuser @*current-user*))
  (sel :many User))


(defendpoint GET "/current" []
  (->404 @*current-user*
         (hydrate [:org_perms :organization])))


(defendpoint GET "/:id" [id]
  ;; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  (sel :one User :id id))


(defendpoint PUT "/:id" [id :as {{:keys [email] :as body} :body}]
  ;; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  ;; can't change email if it's already taken BY ANOTHER ACCOUNT
  (println "EMAIL:" email)
  (when id
    (println "A")
    (check-400 (is-email? email))
    (println "B")
    (check-400 (not (exists? User :email email :id [not= id])))
    (println "C"))
  (check-500 (->> (select-non-nil-keys body :email :first_name :last_name)
                  (mapply upd User id)))
  (sel :one User :id id))


(defendpoint PUT "/:id/password" [id :as {{:keys [password old_password] :as body} :body}]
  ;; caller must supply current and new password attributes
  (check (and password old_password) [400 "You must specify both old_password and password"])
  ;; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  (let-404 [user (sel :one [User :password_salt :password] :id id)]
    (check (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user)) [400 "password mismatch"]))
  (set-user-password id password)
  (sel :one User :id id))


(define-routes)
