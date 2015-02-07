(ns metabase.models.org-perm
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org :refer [Org]]))

(defentity OrgPerm
  (table :core_userorgperm))

(defmethod post-select OrgPerm [_ {:keys [organization_id] :as result}]
  (assoc result
         :organization (sel-fn :one Org :id organization_id)))
