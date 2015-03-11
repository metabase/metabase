(ns metabase.models.org
  (:require [korma.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]))

(defentity Org
  (table :core_organization))

(defn org-can-read
  "Does `*current-user*` have read permissions for `Org` with ORG-ID?"
  [org-id]
  (org-perms-case org-id
    :admin true
    :default true
    nil false))

(defn org-can-write
  "Does `*current-user*` have write permissions for `Org` with ORG-ID?"
  [org-id]
  (org-perms-case org-id
    :admin true
    :default false
    nil false))

(defmethod post-select Org [_ {:keys [id] :as org}]
  (assoc org
         :can_read (delay (org-can-read id))
         :can_write (delay (org-can-write id))))

(defmethod pre-insert Org [_ org]
  (let [defaults {:inherits false}]
    (merge defaults org)))

(defmethod pre-cascade-delete Org [_ {:keys [id]}]
  (cascade-delete 'metabase.models.org-perm/OrgPerm :organization_id id))
