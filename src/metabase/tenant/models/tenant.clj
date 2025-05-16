(ns metabase.tenant.models.tenant
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Tenant [_model] :tenant)

(doto :model/Tenant
  (derive :metabaes/model))
