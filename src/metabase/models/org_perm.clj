(ns metabase.models.org-perm
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org :refer [Org]]))


(defentity OrgPerm
  (table :core_userorgperm))


(defmethod post-select OrgPerm [_ {:keys [organization_id user_id] :as org-perm}]
  (assoc org-perm
         :organization (sel-fn :one Org :id organization_id)
         :user (sel-fn :one "metabase.models.user/User" :id user_id)))


(defn grant-org-perm
  "Grants permission for given User on Org.  Creates record if needed, otherwise updates existing record."
  [org-id user-id is-admin]
  (let [perm (sel :one OrgPerm :user_id user-id :organization_id org-id)
        is-admin (boolean is-admin)]
    (if-not perm
      (ins OrgPerm
        :user_id user-id
        :organization_id org-id
        :admin is-admin)
      (upd OrgPerm (:id perm)
        :admin is-admin))))
