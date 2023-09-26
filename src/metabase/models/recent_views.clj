(ns metabase.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Tables and Dashboards for
  each user."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as m]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(doto :model/RecentViews
  (derive :metabase/model))

(m/defmethod t2/table-name :model/RecentViews
  [_model]
  :recent_views)

(t2/define-before-insert :model/RecentViews
  [log-entry]
  (let [defaults {:timestamp :%now}]
    (merge defaults log-entry)))

(def ^:private recent-views-stored-per-user
  "The number of recently viewed items to keep per user. This should be larger than the number of items returned by the
  /api/activity/recent_views endpoint, but it should not be unbounded."
  30)

(defn- view-ids-to-prune
  "Returns a set of view IDs to prune from the RecentViews table so we only keep the most recent n views per user.
  Ensures that we keep the most recent dashboard view for the user."
  [prior-views n]
  (let [view-ids-to-keep               (map :id (take n prior-views))
        ;; We want to make sure we keep the most recent dashboard view for the user
        views-ids-to-prune             (map :id (drop n prior-views))
        most-recent-dashboard-id       (->> prior-views (filter #(= "Dashboard" (:model %))) first :id)
        pruning-most-recent-dashboard? ((set view-ids-to-keep) most-recent-dashboard-id)]
    (if pruning-most-recent-dashboard?
      (conj (remove #{most-recent-dashboard-id} (set views-ids-to-prune))
            (last view-ids-to-keep))
      view-ids-to-prune)))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id  :- [:maybe ms/PositiveInt]
   model    :- [:enum "card" "dashboard" "table"]
   model-id :- ms/PositiveInt]
  (when user-id
    (t2/with-transaction [_conn]
      (let [prior-views       (t2/select :model/RecentViews :user_id user-id {:order-by [[:timestamp :asc]]})
            view-ids-to-prune (view-ids-to-prune prior-views recent-views-stored-per-user)]
        (t2/insert! :model/RecentViews
                    {:user_id  user-id
                     :model    model
                     :model_id model-id})
        (t2/delete! :model/RecentViews {:id view-ids-to-prune})))))
