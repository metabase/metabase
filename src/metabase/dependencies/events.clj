(ns metabase.dependencies.events
  "Keeps the dependency graph up to date for the entity types tracked on all instances —
  currently just transforms. Handlers for the other entity types live in
  `metabase-enterprise.dependencies.events` and are gated on the `:dependencies` premium feature.

  Create/update handlers mark entities stale in dependency_status. The backfill task does the
  actual computation, off the event thread; see [[metabase.dependencies.task.backfill]]."
  (:require
   [metabase.dependencies.models.dependency :as models.dependency]
   [metabase.dependencies.models.dependency-status :as deps.dependency-status]
   [metabase.dependencies.task.backfill :as task.backfill]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(defn mark-stale-and-trigger!
  "Mark an entity as stale in dependency_status and trigger the backfill job."
  [entity-type entity-id]
  (try
    (deps.dependency-status/mark-stale! entity-type [entity-id])
    (task.backfill/trigger-backfill-job!)
    (catch Throwable e
      (log/error e "Failed to mark entity stale" {:entity-type entity-type :entity-id entity-id}))))

(defn delete-dependencies!
  "Remove an entity's dependency rows and status when the entity is deleted."
  [entity-type entity-id]
  (t2/delete! :model/Dependency :from_entity_type entity-type :from_entity_id entity-id)
  (t2/delete! :model/DependencyStatus :entity_type entity-type :entity_id entity-id))

;; ### Transforms
(derive ::transform-deps :metabase/event)
(derive :event/create-transform ::transform-deps)
(derive :event/update-transform ::transform-deps)

(methodical/defmethod events/publish-event! ::transform-deps
  [_ {:keys [object]}]
  (mark-stale-and-trigger! :transform (:id object)))

(derive ::transform-delete :metabase/event)
(derive :event/delete-transform ::transform-delete)

(methodical/defmethod events/publish-event! ::transform-delete
  [_ {:keys [id]}]
  ;; TODO: (Braden 09/18/2025) Shouldn't we be deleting the downstream deps for dead edges as well as upstream?
  (delete-dependencies! :transform id))

;; On *executing* a transform, its (freshly synced) output table is made to depend on the transform.
;; (And if the target has changed, the old table's dep on the transform is dropped.)
;; The upstream deps of the transform are not touched - those change only when the transform is edited.
(derive ::transform-run :metabase/event)
(derive :event/transform-run-complete ::transform-run)

(defn- transform-table-deps! [{:keys [db-id output-schema output-table transform-id] :as _details}]
  (let [;; output-table is a keyword like :my_schema/my_table
        table-name (name output-table)]
    (when-let [table-id (t2/select-one-fn :id :model/Table :db_id db-id :schema output-schema :name table-name)]
      (models.dependency/replace-dependencies! :table table-id {:transform #{transform-id}}))))

(methodical/defmethod events/publish-event! ::transform-run
  [_ {:keys [object]}]
  (transform-table-deps! object))
