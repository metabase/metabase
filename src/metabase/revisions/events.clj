(ns metabase.revisions.events
  "Handler of the lifecycle events that record a Revision of what a user changes: the update or the create event of an
  entity that has Revisions, which the function that writes the entity and its parts publishes as its last step, so that
  one operation on a Dashboard and its dashcards and tabs is one Revision. The events of the parts make none, and nothing
  is recorded without a user."
  (:require
   [metabase.events.core :as events]
   [metabase.revisions.models.revision :as revision]
   [metabase.revisions.spec :as revisions.spec]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(defn- touch?
  "Whether the update `event` changes none of the columns of its row, as the event of the owner of parts that a write
  changed."
  [{:keys [object previous-object]}]
  (= (into {} object) (into {} previous-object)))

(defn- recorded?
  "Whether the row event `event` calls for a Revision: a create or an update of an entity that has Revisions of its own,
  by a user, that is not a revert or carried by the archive or restore of another entity, and that changes what its spec
  tracks or only touches it."
  [{:keys [operation context object previous-object user-id] :as event}]
  (let [model (u.events/model-of event)
        spec  (revisions.spec/spec model)]
    (boolean
     (and user-id
          spec
          (not (:parent spec))
          (#{:create :update} operation)
          (not (:reverting? context))
          (nil? (:archived-with context))
          (or (= :create operation)
              (touch? event)
              (revision/changed? model previous-object object))))))

(defn- revision-info
  "What the Revision of the entity that the row event `event` is about says."
  [{:keys [operation object user-id context] :as event}]
  {:entity       (u.events/model-of event)
   :id           (:id object)
   :object       object
   :user-id      user-id
   :is-creation? (= :create operation)
   :message      (:revision-message context)})

(defn- revision-rows
  "The Revision rows of the entities of `infos`, the snapshots of each model taken together."
  [infos]
  (into []
        (mapcat (fn [[model infos]]
                  (try
                    (revision/revision-rows model (vec infos))
                    (catch Throwable e
                      (log/warnf "Failed to record the revisions of %d %s: %s" (count infos) model (ex-message e))
                      []))))
        (group-by :entity infos)))

(events/derive! :metabase/lifecycle-event ::revisions)

(methodical/defmethod events/publish-event! ::revisions
  [topic event]
  (when-let [infos (not-empty (into [] (comp (filter recorded?) (map revision-info)) (u.events/row-events topic event)))]
    (let [rows (revision-rows infos)]
      (when (and (seq rows)
                 (try
                   (revision/create-revisions! rows)
                   true
                   (catch Throwable e
                     (log/warnf "Failed to record %d revisions: %s" (count rows) (ex-message e))
                     false)))
        (try
          (revision/publish-created! rows)
          (catch Throwable e
            (log/warnf "Failed to publish the creation of %d revisions: %s" (count rows) (ex-message e))))))))
