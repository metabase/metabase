(ns metabase.api.user
  (:require [cemerick.friend.credentials :as creds]
            [compojure.core :refer [defroutes GET PUT]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer [sel upd exists?]]
            (metabase.models [hydrate :refer [hydrate]]
                             [user :refer [User set-user-password]])
            [metabase.util :refer [is-email? select-non-nil-keys]]
            [metabase.util.password :as password]))


(defendpoint GET "/" []
  ;; user must be a superuser to proceed
  (check-403 (:is_superuser @*current-user*))
  (sel :many User))


(defendpoint GET "/current" []
  (->404 @*current-user*
         (hydrate [:org_perms :organization])))


(defendpoint GET "/:id" [id fish.required]
  ;; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  (check-404 (sel :one User :id id)))

(defannotation email [email]
  `(check (is-email? ~email) [400 (format ~(str (name email) " '%s' is not a valid email.") ~email)])
  email)

(defendpoint PUT "/:id" [id :as {{:keys [email.email] :as body} :body}]
  ;; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  ;; can't change email if it's already taken BY ANOTHER ACCOUNT
  (when id
    (check-400 (not (exists? User :email email :id [not= id]))))
  (check-500 (->> (select-non-nil-keys body :email :first_name :last_name)
                  (mapply upd User id)))
  (sel :one User :id id))

(defannotation complex-password [password]
  `(check (password/is-complex? ~password) [400 "Insufficient password strength"])
  password)

(defendpoint PUT "/:id/password" [id :as {{:keys [password.required.complex-password old_password.required]} :body}]
  (require-params password old_password)
  (check-403 (or (= id *current-user-id*)
                 (:is_superuser @*current-user*)))
  (let-404 [user (sel :one [User :password_salt :password] :id id)]
    (check (creds/bcrypt-verify (str (:password_salt user) old_password) (:password user)) [400 "password mismatch"]))
  (set-user-password id password)
  (sel :one User :id id))


(define-routes)
