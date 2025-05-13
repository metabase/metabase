(ns metabase-enterprise.tenants.model
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(defn name-exists?
  "Given a tenant name, returns truthy if the name (or its slugified version) is already reserved."
  [n]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug (u/slugify n)]
                                     [:= :name n]]}))

(t2/define-before-insert :model/Tenant [tenant]
  (assoc tenant :slug (u/slugify (:name tenant))))

(doto :model/Tenant
  (derive :metabase/model))
