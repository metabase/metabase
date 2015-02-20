(ns metabase.api.user
  (:require [compojure.core :refer [defroutes GET PUT]]
            [medley.core :refer [mapply]]
            [metabase.api.common :refer :all]
            [metabase.db :refer [sel upd exists?]]
            (metabase.models [hydrate :refer [hydrate]]
                             [user :refer [User]])
            [metabase.util :refer [select-non-nil-keys]]))


(defendpoint GET "/" []
  ; user must be a superuser to proceed
  (check-403 (:is_superuser @*current-user*))
  (sel :many User))


(defendpoint GET "/current" []
  (->404 @*current-user*
         (hydrate [:org_perms :organization])))


(defendpoint GET "/:id" [id]
  ; user must be getting their own details OR they must be a superuser to proceed
  (check-403 (or (= id *current-user-id*) (:is_superuser @*current-user*)))
  (sel :one User :id id))


(defendpoint PUT "/:id" [id :as {:keys [body]}]
  (check-403 (= id *current-user-id*))                                     ; you can only update yourself (or can admins update other users?)
  (check-500 (->> (select-non-nil-keys body :email :first_name :last_name)
                  (mapply upd User id)))                                   ; `upd` returns `false` if no updates occured. So in that case return a 500
  (sel :one User :id id))                                                  ; return the updated user


;; TODO: do we want a permissions check here?
(defendpoint PUT "/:id/password" [id :as {:keys [body]}]
  (let [{:keys [password old_password]} body]
    (check (and password old_password) [400 "You must specify both old_password and password"])
    (check-404 (exists? User :id id))
    ;; TODO - match old password against current one
    ;; TODO - password encryption
    (upd User id :password password)
    (sel :one User :id id)))


(define-routes)
