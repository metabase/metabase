(ns metabase.models.org-perm
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org :refer [Org]]))

(defentity OrgPerm
  (table :core_userorgperm))

(defmethod post-select OrgPerm [_ {:keys [organization_id user_id] :as result}]
  (assoc result
         :organization (sel-fn :one Org :id organization_id)
         :user (sel-fn :one (resolve 'metabase.models.user/User) :id user_id)))  ; have to use `resolve` here to avoid circular dependencies
