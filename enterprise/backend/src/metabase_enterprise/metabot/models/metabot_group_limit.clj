(ns metabase-enterprise.metabot.models.metabot-group-limit
  (:require
   [metabase-enterprise.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotGroupLimit [_model] :metabot_group_limit)

(doto :model/MetabotGroupLimit
  (derive :metabase/model)
  (derive ::mi/write-policy.superuser))

(defn all-group-limits
  "Returns all group-level limits, ordered by group_id."
  []
  (metabot.db/group-limits))

(defn group-limit
  "Returns the limit for a specific group, or nil if none is set."
  [group-id]
  (metabot.db/group-limit group-id))

(defn limit-for-user
  "Returns the maximum `max_usage` across all group limits for groups the user belongs to.
   Returns nil if the user has any groups with a null (unlimited) limit"
  [user-id]
  (:max_usage
   (metabot.db/max-usage-for-user user-id)))

(defn set-group-limit!
  "Sets or removes the limit for a specific group. Pass nil to remove (unlimited).
   Returns the updated row, or nil if removed."
  [group-id max-usage]
  (if (nil? max-usage)
    (metabot.db/delete-group-limit! group-id)
    (if-let [existing (group-limit group-id)]
      (metabot.db/update-group-limit! (:id existing) max-usage)
      (metabot.db/insert-group-limit! {:group_id group-id :max_usage max-usage})))
  (group-limit group-id))
