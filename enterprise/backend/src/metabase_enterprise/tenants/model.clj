(ns metabase-enterprise.tenants.model
  (:require
   [metabase.models.interface :as mi]
   [metabase.util :as u]
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

(methodical/defmethod t2/batched-hydrate [:model/Tenant :member_count]
  [_model k tenants]
  (mi/instances-with-hydrated-data
   tenants k
   (fn []
     (->> (t2/query {:select [[:tenant_id] [[:count :*]]]
                     :from [(t2/table-name :model/User)]
                     :where [:and
                             [:in :tenant_id (map u/the-id tenants)]
                             [:= :type "personal"]
                             :is_active]
                     :group-by [:tenant_id]})
          (map (juxt :tenant_id :count))
          (into {})))
   :id
   {:default 0}))
