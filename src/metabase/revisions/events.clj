(ns metabase.revisions.events
  "Handlers of the lifecycle events that record a Revision of what a user changes: the events of the writes of one
  batch are grouped by the entity they belong to, and the Revision of each entity is written once, from the entity as
  it then is, so one operation on a Dashboard and its dashcards and tabs is one Revision. Nothing is recorded without
  a user."
  (:require
   [metabase.events.core :as events]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private revisioned-models
  "The models whose rows have Revisions."
  #{:model/Card :model/CardTest :model/Dashboard :model/Document :model/Exploration :model/Measure
    :model/Segment :model/Transform :model/TransformTest})

(def ^:private creator-recorded
  "The models whose saved tests record their creator as the author of the creation Revision when a user writes it, and
  whose reversion writes a Revision of its own update."
  #{:model/CardTest :model/TransformTest})

(def ^:private ignored-columns
  "For each model, the columns whose update alone is not a change to record."
  {:model/Card      #{:updated_at :last_used_at :view_count :collection_position :cache_invalidated_at}
   :model/Dashboard #{:updated_at :last_viewed_at :view_count :collection_position :position}})

(defn- owner
  "The `[model id]` of the entity whose Revision the `event` calls for, or nil when it calls for none."
  [{:keys [model operation object previous-object context] :as event}]
  (cond
    (and (contains? revisioned-models model) (#{:create :update} operation))
    (when (and (or (not (:reverting? context)) (creator-recorded model))
               (not (and (= :update operation)
                         (every? (get ignored-columns model #{:updated_at}) (u.events/changed-keys event)))))
      [model (:id object)])

    (#{:model/DashboardCard :model/DashboardTab} model)
    (when-not (:reverting? context)
      [:model/Dashboard (:dashboard_id (or object previous-object))])))

(defn- push!
  "Write the Revision of the entity `[model id]` as it is now, for the `events` of its writes."
  [[model id] events _all-events]
  (let [own        (first (filter #(and (= model (:model %)) (= :create (:operation %))) events))
        user-id    (some :user-id events)
        creator-id (when (and user-id own (creator-recorded model)) (:creator_id (:object own)))]
    (when-let [user-id (or creator-id user-id)]
      (try
        (when-let [object (revisions.db/entity model id)]
          (revision/push-revision! {:entity       model
                                    :id           id
                                    :object       object
                                    :user-id      user-id
                                    :is-creation? (boolean own)
                                    :message      (some #(get-in % [:context :revision-message]) events)}))
        (catch Throwable e
          (log/warnf "Failed to record a revision of %s %s: %s" model id (ex-message e)))))))

(events/register-owned-consumer! ::revisions owner push!)
