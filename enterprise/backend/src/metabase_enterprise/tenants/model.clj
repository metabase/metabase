(ns metabase-enterprise.tenants.model
  (:require
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(defn name->slug [n]
  (u/slugify n))

(defn name-exists? [n]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug (u/slugify n)]
                                     [:= :name n]]}))

(t2/define-before-insert :model/Tenant [tenant]
  (assoc tenant :slug (u/slugify (:name tenant))))

(doto :model/Tenant
  (derive :metabase/model))
