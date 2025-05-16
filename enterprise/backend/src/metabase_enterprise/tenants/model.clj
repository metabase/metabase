(ns metabase-enterprise.tenants.model
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(defn tenant-exists?
  "Given a tenant name, returns truthy if the name (or its slugified version) is already reserved."
  [{n :name slug :slug}]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name n]]}))

(doto :model/Tenant
  (derive :metabase/model))
