(ns metabase.revisions.events
  "Handlers of the lifecycle events that record a Revision of what a user changes: the events of the writes of one
  batch are grouped by the entity they belong to, and the Revision of each entity is written once, from the entity as
  it then is, so one operation on a Dashboard and its dashcards and tabs is one Revision. Nothing is recorded without
  a user."
  (:require
   [metabase.events.core :as events]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- user-edit?
  "Whether the lifecycle `event` is a write that a Revision should say a user made: not one that the archive or restore
  of another entity carried to its row, nor an update that changes nothing that the revision spec of the model
  tracks."
  [{:keys [context object previous-object] :as event}]
  (and (nil? (:archived-with context))
       (or (not (and object previous-object))
           (revision/changed? (u.events/model-of event) previous-object object))))

(defn- parent-ref
  "The `[parent-model parent-id]` of the row that the `event` writes, nil for a model whose rows have Revisions of
  their own."
  [{:keys [object previous-object] :as event}]
  (when-let [{:keys [model key]} (revisions.spec/parent (u.events/model-of event))]
    [model (get (or object previous-object) key)]))

(defn- own-entity
  "The `[model id]` of the row that the `event` writes when its model has Revisions of its own and the event calls for
  one, else nil."
  [{:keys [operation object context] :as event}]
  (let [model (u.events/model-of event)
        spec  (revisions.spec/spec model)]
    (when (and spec
               (not (:parent spec))
               (#{:create :update} operation)
               (not (:reverting? context))
               (user-edit? event))
      [model (:id object)])))

(defn- part-write?
  "Whether the `event` writes a row that belongs to the Revision of a parent, and calls for one."
  [{:keys [context] :as event}]
  (and (some? (parent-ref event))
       (not (:reverting? context))
       (user-edit? event)))

(defn- parent-links
  "The `[model id]` of the parent of each of `refs`, the `[model id]` of rows that belong to the Revision of a parent
  of their own, loaded together: one query for the rows of each model, however many levels there are above them."
  [refs]
  (loop [pending (into #{} (filter #(revisions.spec/parent (first %))) refs)
         links   {}]
    (if (empty? pending)
      links
      (let [found (into {}
                        (mapcat (fn [[model refs*]]
                                  (let [{parent-model :model, k :key} (revisions.spec/parent model)]
                                    (for [[id parent-id] (revisions.db/parent-ids model k (map second refs*))]
                                      [[model id] [parent-model parent-id]]))))
                        (group-by first pending))]
        (recur (into #{}
                     (comp (map val)
                           (filter #(revisions.spec/parent (first %)))
                           (remove #(contains? (merge links found) %)))
                     found)
               (merge links found))))))

(defn- entity-of
  "A fn of a lifecycle event returning the `[model id]` of the entity whose Revision it calls for, nil when it calls
  for none, the parents that the events of one batch name being `links`, see [[parent-links]]."
  [links]
  (fn [event]
    (or (own-entity event)
        (when (part-write? event)
          (loop [ref (parent-ref event)]
            (cond
              (nil? (revisions.spec/parent (first ref))) ref
              (contains? links ref)                      (recur (get links ref))
              :else                                      nil))))))

(defn- without-children
  "`row` of `model` with no child rows, so that nothing loads them."
  [model row]
  (reduce (fn [row {hydration-key :as}] (assoc row hydration-key []))
          row
          (vals (revisions.spec/children model))))

(defn- revision-row
  "The Revision row of the entity `[model id]` as it is now, for the `events` of its writes, or nil when no user made
  them."
  [[model id] events]
  (let [own        (first (filter #(and (= model (:model %)) (= :create (:operation %))) events))
        user-id    (some :user-id events)]
    (when user-id
      (try
        (when-let [object (some-> (or (some #(when (= model (:model %)) (:object %)) events)
                                      (revisions.db/entity model id))
                                  (cond-> (and own (every? #(= model (:model %)) events))
                                    (->> (without-children model))))]
          (revision/revision-row {:entity       model
                                  :id           id
                                  :object       object
                                  :user-id      user-id
                                  :is-creation? (boolean own)
                                  :message      (some #(get-in % [:context :revision-message]) events)}))
        (catch Throwable e
          (log/warnf "Failed to record a revision of %s %s: %s" model id (ex-message e)))))))

(defn- owner
  "The one owner of the events of a batch that call for a Revision, nil for the others, without reading the app DB."
  [event]
  (when (or (own-entity event) (part-write? event))
    ::revisions))

(defn- push!
  "Write, in one statement, the Revision of each entity that `events` change, as it is now."
  [_owner events _all-events]
  (when (some :user-id events)
    (let [entity    (entity-of (parent-links (into #{} (keep parent-ref) events)))
          by-entity (group-by entity events)
          rows      (into [] (keep #(revision-row % (get by-entity %))) (remove nil? (keys by-entity)))]
      (when (seq rows)
        (try
          (revisions.db/insert-revisions! rows)
          (catch Throwable e
            (log/warnf "Failed to record %d revisions: %s" (count rows) (ex-message e))))))))

(events/register-owned-consumer! ::revisions owner push!)
