(ns metabase-enterprise.metabot.models.metabot-instance-limit
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotInstanceLimit [_model] :metabot_instance_limit)

(doto :model/MetabotInstanceLimit
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(defn instance-limit
  "Returns the limit for a given tenant, or the instance-wide limit when `tenant-id` is nil.
   Returns nil if no limit is set."
  [tenant-id]
  (t2/select-one :model/MetabotInstanceLimit :tenant_id tenant-id))

(defn set-instance-limit!
  "Sets or removes the limit for a given tenant (or instance-wide when `tenant-id` is nil).
   Pass nil for `max-usage` to remove the limit. Returns the updated row, or nil if removed."
  [tenant-id max-usage]
  (if (nil? max-usage)
    (t2/delete! :model/MetabotInstanceLimit :tenant_id tenant-id)
    (if-let [existing (instance-limit tenant-id)]
      (t2/update! :model/MetabotInstanceLimit (:id existing) {:max_usage max-usage})
      (t2/insert! :model/MetabotInstanceLimit {:tenant_id tenant-id :max_usage max-usage})))
  (instance-limit tenant-id))

(defn all-tenant-limits
  "Returns all tenant-level limits (where tenant_id is not null), ordered by tenant_id."
  []
  (t2/select :model/MetabotInstanceLimit :tenant_id [:not= nil] {:order-by [[:tenant_id :asc]]}))
