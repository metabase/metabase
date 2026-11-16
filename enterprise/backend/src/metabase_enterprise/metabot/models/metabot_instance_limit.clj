(ns metabase-enterprise.metabot.models.metabot-instance-limit
  (:require
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotInstanceLimit [_model] :metabot_instance_limit)

(doto :model/MetabotInstanceLimit
  (derive :metabase/model)
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser)
  (derive ::mi/create-policy.superuser))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-max-usage
  "Throw a 400 unless `max-usage` is nil or a non-negative integer."
  [max-usage]
  (api/check-400 (or (nil? max-usage) (nat-int? max-usage))
                 (tru "max_usage must be a non-negative integer")))

(t2/define-before-insert :model/MetabotInstanceLimit
  [row]
  (check-max-usage (:max_usage row))
  row)

(t2/define-before-update :model/MetabotInstanceLimit
  [row]
  (let [changes (t2/changes row)]
    (when (contains? changes :max_usage)
      (check-max-usage (:max_usage changes))))
  row)

(defn instance-limit
  "Returns the limit for a given tenant, or the instance-wide limit when `tenant-id` is nil.
   Returns nil if no limit is set."
  [tenant-id]
  (metabot.db/instance-limit tenant-id))

(defn set-instance-limit!
  "Sets or removes the limit for a given tenant (or instance-wide when `tenant-id` is nil).
   Pass nil for `max-usage` to remove the limit. Returns the updated row, or nil if removed."
  [tenant-id max-usage]
  (if (nil? max-usage)
    (metabot.db/delete-instance-limit! tenant-id)
    (if-let [existing (instance-limit tenant-id)]
      (metabot.db/update-instance-limit! (:id existing) max-usage)
      (metabot.db/insert-instance-limit! {:tenant_id tenant-id :max_usage max-usage})))
  (instance-limit tenant-id))

(defn all-tenant-limits
  "Returns all tenant-level limits (where tenant_id is not null), ordered by tenant_id."
  []
  (metabot.db/tenant-limits))
