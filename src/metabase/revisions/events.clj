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
    :model/Segment :model/SegmentTest :model/Transform :model/TransformTest})

(def ^:private creator-recorded
  "The models whose saved tests record their creator as the author of the creation Revision when a user writes it, and
  whose reversion writes a Revision of its own update."
  #{:model/CardTest :model/SegmentTest :model/TransformTest})

(def ^:private ignored-columns
  "For each model, the columns whose update alone is not a change to record."
  {:model/Card      #{:updated_at :last_used_at :view_count :collection_position :cache_invalidated_at}
   :model/Dashboard #{:updated_at :last_viewed_at :view_count :collection_position :position}
   :model/Document  #{:updated_at :last_viewed_at :view_count :collection_position}})

(defn- carried-by-archive?
  "Whether `event` is an update that the archive or restore of another entity carried to its row, which records no
  Revision."
  [{:keys [operation context]}]
  (and (= :update operation)
       (some? (:archived-with context))))

(defn- entity
  "The `[model id]` of the entity whose Revision the `event` calls for, or nil when it calls for none."
  [{:keys [model operation object previous-object context] :as event}]
  (cond
    (and (contains? revisioned-models model) (#{:create :update} operation))
    (when (and (or (not (:reverting? context)) (creator-recorded model))
               (not (carried-by-archive? event))
               (not (and (= :update operation)
                         (every? (get ignored-columns model #{:updated_at}) (u.events/changed-keys event)))))
      [model (:id object)])

    (#{:model/DashboardCard :model/DashboardTab} model)
    (when-not (:reverting? context)
      [:model/Dashboard (:dashboard_id (or object previous-object))])))

(defn- changes-entity?
  "Whether `event`, one of the writes of the entity `[model id]`, changes what its Revision records: a write of one of
  its parts, its creation, or an update of its row that its serialization sees."
  [[model id] {:keys [operation object previous-object] :as event}]
  (or (not= model (:model event))
      (not= :update operation)
      (revision/row-changed? model id previous-object object)))

(defn- revision-row
  "The Revision row of the entity `[model id]` as it is now, for the `events` of its writes, or nil when they do not
  change it or no user made them."
  [[model id :as entity] events]
  (let [own        (first (filter #(and (= model (:model %)) (= :create (:operation %))) events))
        user-id    (some :user-id events)
        creator-id (when (and user-id own (creator-recorded model)) (:creator_id (:object own)))]
    (when-let [user-id (or creator-id user-id)]
      (try
        (when (some #(changes-entity? entity %) events)
          (when-let [object (some-> (or (some #(when (= model (:model %)) (:object %)) events)
                                        (revisions.db/entity model id))
                                    (cond-> (and own (= :model/Dashboard model) (every? #(= model (:model %)) events))
                                      (assoc :dashcards [] :tabs [])))]
            (revision/revision-row {:entity       model
                                    :id           id
                                    :object       object
                                    :user-id      user-id
                                    :is-creation? (boolean own)
                                    :message      (some #(get-in % [:context :revision-message]) events)})))
        (catch Throwable e
          (log/warnf "Failed to record a revision of %s %s: %s" model id (ex-message e)))))))

(defn- owner
  "The one owner of the events of a batch that call for a Revision, nil for the others."
  [event]
  (when (entity event)
    ::revisions))

(defn- push!
  "Write, in one statement, the Revision of each entity that `events` change, as it is now."
  [_owner events _all-events]
  (let [by-entity (group-by entity events)
        rows      (into [] (keep #(revision-row % (get by-entity %))) (distinct (map entity events)))]
    (when (seq rows)
      (try
        (revision/record-revisions! rows)
        (catch Throwable e
          (log/warnf "Failed to record %d revisions: %s" (count rows) (ex-message e)))))))

(events/register-owned-consumer! ::revisions owner push!)
