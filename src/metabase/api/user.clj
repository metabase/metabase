(ns metabase.api.user
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes GET PUT]]
            [metabase.db :refer [sel upd]]
            [metabase.models.hydrate :refer [hydrate]]
            [metabase.models.user :refer [User]]))


(defendpoint GET "/" []
  ;; TODO - permissions check
  ;; TODO - limit the keys available in the response objects
  (sel :many User :is_active true))


(defendpoint GET "/:user-id" [user-id]
  ;; TODO - permissions check
  ;; TODO - map to serializer.  strip fields (is_active, is_staff).  calculate fields (common_name)
  (let-404 [user (sel :one User :id user-id)]
    ;; TODO - we need a reusable way to do something like this for serializing output for responses
    (select-keys user [:id :email :first_name :last_name :last_login :is_superuser])))


(defendpoint GET "/current" []
  (->404 @*current-user*
         (hydrate [:org_perms :organization])))


(defendpoint PUT "/:user-id" [user-id :as {body :body}]
  ;; TODO - permissions check
  ;; TODO - validations (email address must be unique)
  (let-404 [user (sel :one User :id user-id)]
    (upd User user-id
      :email (get body :email (:email user))
      :first_name (get body :first_name (:first_name user))
      :last_name (get body :last_name (:last_name user)))
    (let [updated-user (sel :one User :id user-id)]
      (select-keys updated-user [:id :email :first_name :last_name :last_login :is_superuser]))))


(defendpoint PUT "/:user-id/password" [user-id :as {body :body}]
  (if-not (and (:old_password body) (:password body))
    {:status 400 :body "You must specifby both old_password and password"}
    (let-404 [user (sel :one User :id user-id)]
      ;; TODO - match old password against current one
      ;; TODO - password encryption
      (upd User user-id
        :password (get body :password))
      (let [updated-user (sel :one User :id user-id)]
        (select-keys updated-user [:id :email :first_name :last_name :last_login :is_superuser])))))


(define-routes)
