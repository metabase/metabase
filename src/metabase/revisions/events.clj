(ns metabase.revisions.events
  "Handlers of the lifecycle events that record a Revision of what a user changes: the events of the writes of one
  batch are grouped by the entity they belong to, and the Revision of each entity is written once, from the entity as
  it then is, so one operation on a Dashboard and its dashcards and tabs is one Revision. Nothing is recorded without
  a user."
  (:require
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.util :as u]
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
  revision/models-recording-own-revert)

(def ^:private ignored-columns
  "For each model, the columns whose change alone is not content to snapshot, `:default` being the counters and
  timestamps that every model has."
  {:default         #{:updated_at :view_count :last_used_at :last_viewed_at :cache_invalidated_at :collection_position
                      :entity_id}
   :model/Dashboard #{:position}
   :model/Measure   #{:dimensions :dimension_mappings}
   :model/Transform #{:last_checkpoint_value :target_table_id :table_dependencies}})

(defn- ignored-column?
  [model column]
  (or (contains? (ignored-columns :default) column)
      (contains? (get ignored-columns model) column)))

(defn- model-overrides
  "The overrides that a user can set in the columns of `metadata` that `other` has too, by column name."
  [metadata other]
  (let [names (into #{} (map :name) other)
        keys* (into #{:name} (map u/->snake_case_en) (lib/model-preserved-keys false))]
    (into {}
          (comp (filter (comp names :name))
                (map (juxt :name #(select-keys % keys*))))
          metadata)))

(defn- edited-column?
  "Whether the change of `column` in the update `event` of a row of `model` is content to snapshot: the result metadata
  of a model is by what a user sets in it, and of any other card never, for the product recomputes it."
  [model column {:keys [object previous-object]}]
  (if (and (= :model/Card model) (= :result_metadata column))
    (let [previous (:result_metadata previous-object)
          current  (:result_metadata object)]
      (boolean (and (= :model (keyword (:type object)))
                    (seq previous)
                    (not= (model-overrides previous current) (model-overrides current previous)))))
    true))

(defn- user-edit?
  "Whether the lifecycle `event` is a write that a Revision should say a user made: not one that the archive or restore
  of another entity carried to its row, nor an update that changes nothing but ignored columns."
  [{:keys [context object previous-object] :as event}]
  (and (nil? (:archived-with context))
       (or (not (and object previous-object))
           (let [model (u.events/model-of event)]
             (boolean (some #(and (not (ignored-column? model %)) (edited-column? model % event))
                            (u.events/changed-keys event)))))))

(defn- entity
  "The `[model id]` of the entity whose Revision the `event` calls for, or nil when it calls for none."
  [{:keys [model operation object previous-object context] :as event}]
  (cond
    (and (contains? revisioned-models model) (#{:create :update} operation))
    (when (and (or (not (:reverting? context)) (creator-recorded model))
               (user-edit? event))
      [model (:id object)])

    (#{:model/DashboardCard :model/DashboardTab :model/DashboardCardSeries} model)
    (when (and (not (:reverting? context)) (user-edit? event))
      (when-let [dashboard-id (if (= :model/DashboardCardSeries model)
                                (revisions.db/dashboard-id-of-dashcard (:dashboardcard_id (or object previous-object)))
                                (:dashboard_id (or object previous-object)))]
        [:model/Dashboard dashboard-id]))))

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
