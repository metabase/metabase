(ns metabase-enterprise.metabot.models.metabot-group-limit
  (:require
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
  (t2/select :model/MetabotGroupLimit {:order-by [[:group_id :asc]]}))

(defn group-limit
  "Returns the limit for a specific group, or nil if none is set."
  [group-id]
  (t2/select-one :model/MetabotGroupLimit :group_id group-id))

(defn limit-for-user
  "Returns the maximum `max_usage` across all group limits for groups the user belongs to.
   Returns nil if the user has any groups with a null (unlimited) limit"
  [user-id]
  (:max_usage
   (t2/query-one {:select    [[[:case
                                [:= [[:count :*]] [[:count :gl.max_usage]]]
                                [[:max :gl.max_usage]]]
                               :max_usage]]
                  :from      [[:permissions_group_membership :pgm]]
                  :left-join [[:metabot_group_limit :gl] [:= :pgm.group_id :gl.group_id]]
                  :where     [:= :pgm.user_id user-id]})))

(defn set-group-limit!
  "Sets or removes the limit for a specific group. Pass nil to remove (unlimited).
   Returns the updated row, or nil if removed."
  [group-id max-usage]
  (if (nil? max-usage)
    (t2/delete! :model/MetabotGroupLimit :group_id group-id)
    (if-let [existing (group-limit group-id)]
      (t2/update! :model/MetabotGroupLimit (:id existing) {:max_usage max-usage})
      (t2/insert! :model/MetabotGroupLimit {:group_id group-id :max_usage max-usage})))
  (group-limit group-id))
