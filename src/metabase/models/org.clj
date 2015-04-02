(ns metabase.models.org
  (:require [korma.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.models.org-perm :refer [OrgPerm]]))

(defentity Org
  (table :core_organization)
  (has-many OrgPerm {:fk :organization_id})
  (transform #(clojure.set/rename-keys % {:core_userorgperm :org-perms}))
  (assoc :hydration-keys #{:organization}))

(defn org-can-read
  "Does `*current-user*` have read permissions for `Org` with ORG-ID?"
  [org-id]
  (org-perms-case org-id
    :admin   true
    :default true
    nil      false))

(defn org-can-write
  "Does `*current-user*` have write permissions for `Org` with ORG-ID?"
  [org-id]
  (org-perms-case org-id
    :admin   true
    :default false
    nil      false))

(defmethod post-select Org [_ {:keys [id] :as org}]
  (assoc org
         :can_read  (delay (org-can-read id))
         :can_write (delay (org-can-write id))))

(defmethod pre-insert Org [_ org]
  (let [defaults {:inherits false}]
    (merge defaults org)))

(defmethod pre-cascade-delete Org [_ {:keys [id]}]
  (cascade-delete OrgPerm :organization_id id))
