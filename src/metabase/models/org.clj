(ns metabase.models.org
  (:use korma.core
        [metabase.models.org-perm :only (OrgPerm)]))

(defentity Org
  (table :core_organization)
;  (entity-fields
;    :id
;    :name
;    :description
;    :logo_url
;    :inherits
;    :slug)
  (has-many OrgPerm {:fk :organization_id}))
