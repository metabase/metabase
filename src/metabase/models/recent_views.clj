(ns metabase.models.recent-views
  "The Recent Views table is used to track the most recent views of objects such as Cards, Tables and Dashboards for
  each user."
  (:require
    #_{:clj-kondo/ignore [:deprecated-namespace]}
   [java-time.api :as t]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as m]
   [steffan-westcott.clj-otel.api.trace.span :as span]
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

(def ^:private ^:dynamic *recent-views-stored-per-user*
  "The number of recently viewed items to keep per user. This should be larger than the number of items returned by the
  /api/activity/recent_views endpoint, but it should still be lightweight to read all of a user's recent views at once."
  30)

(defn- view-ids-to-prune
  "Returns a set of view IDs to prune from the RecentViews table so we only keep the most recent n views per user.
  Ensures that we keep the most recent dashboard view for the user."
  [prior-views n]
  (if (< (count prior-views) n)
    []
    (let [ids-to-keep                    (map :id (take n prior-views))
          ;; We want to make sure we keep the most recent dashboard view for the user
          ids-to-prune                   (map :id (drop n prior-views))
          most-recent-dashboard-id       (->> prior-views (filter #(= "dashboard" (:model %))) first :id)
          pruning-most-recent-dashboard? ((set ids-to-prune) most-recent-dashboard-id)]
      (if pruning-most-recent-dashboard?
        (conj (remove #{most-recent-dashboard-id} (set ids-to-prune))
              (last ids-to-keep))
        ids-to-prune))))

(mu/defn update-users-recent-views!
  "Updates the RecentViews table for a given user with a new view, and prunes old views."
  [user-id  :- [:maybe ms/PositiveInt]
   model    :- [:or
                [:enum :model/Card :model/Table :model/Dashboard]
                :string]
   model-id :- ms/PositiveInt]
  (when user-id
    (span/with-span!
      {:name       "update-users-recent-views!"
       :attributes {:model/id   model-id
                    :user/id    user-id
                    :model/name (u/lower-case-en model)}}
      (t2/with-transaction [_conn]
        (t2/insert! :model/RecentViews {:user_id  user-id
                                        :model    (u/lower-case-en (name model))
                                        :model_id model-id})
        (let [current-views (t2/select :model/RecentViews :user_id user-id {:order-by [[:id :desc]]})
              ids-to-prune  (view-ids-to-prune current-views *recent-views-stored-per-user*)]
          (when (seq ids-to-prune)
            (t2/delete! :model/RecentViews :id [:in ids-to-prune])))))))

(defn most-recently-viewed-dashboard-id
  "Returns ID of the most recently viewed dashboard for a given user within the last 24 hours, or `nil`."
  [user-id]
  (t2/select-one-fn
   :model_id
   :model/RecentViews
   {:where    [:and
               [:= :user_id user-id]
               [:= :model (h2x/literal "dashboard")]
               [:> :timestamp (t/minus (t/zoned-date-time) (t/days 1))]]
    :order-by [[:id :desc]]}))

(defn user-recent-views
  "Returns the most recent `n` unique views for a given user."
  ([user-id]
   (user-recent-views user-id *recent-views-stored-per-user*))

  ([user-id n]
   (let [all-user-views (t2/select-fn-vec #(select-keys % [:model :model_id])
                                          :model/RecentViews
                                          :user_id user-id
                                          {:order-by [[:id :desc]]
                                           :limit    *recent-views-stored-per-user*})]
     (->> (distinct all-user-views)
          (take n)
          ;; Lower-case the model name, since that's what the FE expects
          (map #(update % :model u/lower-case-en))))))
