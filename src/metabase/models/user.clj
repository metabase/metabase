(ns metabase.models.user
  (:use korma.core
        [metabase.models.org-perm :only (OrgPerm)]))

(defentity User
  (table :core_user)
  (has-many OrgPerm {:fk :user_id}))
