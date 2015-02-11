(ns metabase.api.user
  (:require [metabase.api.common :refer :all]
            [compojure.core :refer [defroutes GET PUT]]
            [metabase.db :refer [sel upd]]
            [metabase.models.hydrate :refer [hydrate]]
            [metabase.models.user :refer [User]]))


(def user-list
  (GET "/" []
       ;; TODO - permissions check
       ;; TODO - map to serializer.
       {:status 200
        :body (sel :many User :is_active true)}))

(def user-get
  (GET "/:user-id" [user-id]
       ;; TODO - permissions check
       ;; TODO - map to serializer.  strip fields (is_active, is_staff).  calculate fields (common_name)
       (let-404 [user (sel :one User :id user-id)]
                   {:status 200
                    ;; TODO - we need a reusable way to do something like this for serializing output for responses
                    :body (select-keys user [:id :email :first_name :last_name :last_login :is_superuser])})))

(defendpoint GET "/current" []
  (->404 (*current-user*)
         (hydrate [:org_perms :organization])))

(def user-update
  (PUT "/:user-id" [user-id :as {body :body}]
       ;; TODO - permissions check
       ;; TODO - validations (email address must be unique)
       (let-404 [user (sel :one User :id user-id)]
                   ;; TODO - how can we pass a useful error message in the 500 response on error?
                   (do
                     ;; TODO - is there a more idiomatic way to do this?  update row, then select it for output
                     (upd User user-id
                          ;; TODO - find a way to make this cleaner.  we don't want to modify the value if it doesn't exist
                          :email (get body :email (:email user))
                          :first_name (get body :first_name (:first_name user))
                          :last_name (get body :last_name (:last_name user)))
                     (let [updated-user (sel :one User :id user-id)]
                       {:status 200
                        :body (select-keys updated-user [:id :email :first_name :last_name :last_login :is_superuser])})))))

(def user-update-password
  (PUT "/:user-id/password" [user-id :as {body :body}]
       ;; TODO - implementation
       {:status 200
        :body {}}))


(define-routes
  ;; TODO - this feels bleh.  is it better to put the actual route data here
  ;;        and just have the endpoints be plain functions?
  ;;        best way to automate building this list?
  user-list
  user-get
  user-update
  user-update-password)
