(ns metabase-enterprise.remote-sync.events
  "Event handlers for tracking model changes in remote-synced collections.

   Listens to Metabase model events (create/update/delete) and maintains the
   RemoteSyncObject table with the current sync status of each tracked model.
   This enables the remote sync system to know which objects have changed
   since the last sync operation.

   Event handlers are registered using specs from `metabase-enterprise.remote-sync.spec`.
   Each spec defines eligibility checking, field hydration, and other configuration.

   Tracked model types:
   - Card, Dashboard, Document, NativeQuerySnippet, Timeline, Collection
   - Table (when published in a remote-synced collection)
   - Field, Segment (when belonging to a published table in a remote-synced collection)
   - Transform, TransformTag, transforms-namespace Collections (when remote-sync-transforms setting is enabled)"
  (:require
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Helper functions for model change tracking

(defn- create-or-update-remote-sync-object-entry!
  "Creates or updates a remote sync object entry for a model change.

   Parameters:
   - model-type: Type of model ('Card', 'Dashboard', 'Document', 'Collection', etc.)
   - model-id: ID of the affected model
   - status: Sync status ('create', 'update', 'removed', 'delete', 'error', 'synced')
   - hydrate-details-fn: Function that takes model-id and returns a map with :name, :collection_id,
                         and optionally :display, :table_id, :table_name"
  [model-type model-id status hydrate-details-fn]
  (let [existing (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      (not existing)
      (let [model-details (hydrate-details-fn model-id)]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type model-type
                     :model_id model-id
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
                     :model_table_id (:table_id model-details)
                     :model_table_name (:table_name model-details)
                     :status status
                     :status_changed_at (t/offset-date-time)}))

      ;; If the entity was created and then removed/deleted before sync, just delete the entry from tracking
      (and (= "create" (:status existing)) (contains? #{"removed" "delete"} status))
      (t2/delete! :model/RemoteSyncObject (:id existing))

      ;; Just update the status, object doesn't exist to update other info
      (= "delete" (:status existing))
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status status
                   :status_changed_at (t/offset-date-time)})

      ;; If the entry was created, the status should remain create until synced
      (not (= "create" (:status existing)))
      (let [model-details (hydrate-details-fn model-id)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status status
                     :status_changed_at (t/offset-date-time)
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
                     :model_table_id (:table_id model-details)
                     :model_table_name (:table_name model-details)})))))

;;; ----------------------------------------- Spec-based Event Handling ------------------------------------------------

(defn- create-or-update-sync-object-from-spec!
  "Creates or updates a RemoteSyncObject entry using a spec for field hydration.
   This is the spec-based version of create-or-update-remote-sync-object-entry!."
  [model-spec model-id status]
  (let [model-type (:model-type model-spec)
        existing   (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      ;; No existing entry - create new one
      (not existing)
      (let [model-details (spec/hydrate-model-details model-spec model-id)
            fields        (spec/build-sync-object-fields model-spec model-details)]
        (t2/insert! :model/RemoteSyncObject
                    (merge {:model_type        model-type
                            :model_id          model-id
                            :status            status
                            :status_changed_at (t/offset-date-time)}
                           fields)))

      ;; Created then removed/deleted before sync - delete the entry
      (and (= "create" (:status existing)) (contains? #{"removed" "delete"} status))
      (t2/delete! :model/RemoteSyncObject (:id existing))

      ;; Already deleted - just update status
      (= "delete" (:status existing))
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status            status
                   :status_changed_at (t/offset-date-time)})

      ;; Status is not "create" - update with new details
      (not= "create" (:status existing))
      (let [model-details (spec/hydrate-model-details model-spec model-id)
            fields        (spec/build-sync-object-fields model-spec model-details)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    (merge {:status            status
                            :status_changed_at (t/offset-date-time)}
                           fields))))))

(defn- handle-model-event-from-spec
  "Generic event handler that uses a spec for all configuration.
   Checks eligibility, determines status, and creates/updates the sync object."
  [model-spec topic {:keys [object]}]
  (let [model-type     (:model-type model-spec)
        model-id       (:id object)
        eligible?      (spec/check-eligibility model-spec object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)
        status         (spec/determine-status model-spec topic object)]
    (cond
      ;; Model is eligible for sync
      eligible?
      (do
        (log/infof "Creating remote sync object entry for %s %s (status: %s)"
                   model-type model-id status)
        (create-or-update-sync-object-from-spec! model-spec model-id status))

      ;; Model was synced but no longer eligible - mark as removed
      (and existing-entry (not eligible?))
      (do
        (log/infof "%s %s moved out of sync scope, marking as removed" model-type model-id)
        (create-or-update-sync-object-from-spec! model-spec model-id "removed")))))

(defn- register-events-for-spec!
  "Registers event handlers for a single spec. Creates event hierarchy and
   registers a methodical handler for the parent event."
  [model-spec]
  (let [event-kws (spec/event-keywords model-spec)
        parent-kw (:parent event-kws)]
    ;; Derive event hierarchy
    (derive parent-kw :metabase/event)
    (doseq [[_event-type event-kw] (dissoc event-kws :parent)]
      (derive event-kw parent-kw))

    ;; Register the handler using methodical's runtime API
    ;; (defmethod requires compile-time dispatch values, so we use add-primary-method!)
    ;; Note: We use #'events/publish-event! (the var) because add-primary-method! expects a var/atom
    ;; The method signature matches defmethod: [topic event], not [next-method topic event]
    (methodical/add-primary-method!
     #'events/publish-event!
     parent-kw
     (fn [topic event]
       (handle-model-event-from-spec model-spec topic event)))))

;;; --------------------------------- Spec-based Event Registration (Non-Collection) -----------------------------------
;; Register event handlers for models that use standard spec-based handling.
;; Collection has special handling and is registered separately below.

(doseq [[_model-key model-spec] (dissoc spec/remote-sync-specs :model/Collection)]
  (register-events-for-spec! model-spec))

;;; ----------------------------------------- Collection Event Handler -------------------------------------------------
;; Collection has special handling due to side effects (tracking published tables when
;; a collection becomes remote-synced). This handler is kept separate from the standard
;; spec-based registration.

;; Collection create/update events - derive from common parent for shared handling
(derive ::collection-change-event :metabase/event)
(derive :event/collection-create ::collection-change-event)
(derive :event/collection-update ::collection-change-event)

(defn- hydrate-collection-details
  "Hydrates details for a Collection."
  [id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id id))

(defn- transforms-namespace-collection?
  "Check if this is a transforms-namespace collection."
  [collection]
  (= (keyword (:namespace collection)) :transforms))

(defn- should-sync-collection?
  "Check if a collection should be synced - either remote-synced or transforms-namespace with setting enabled."
  [collection]
  (or (collections/remote-synced-collection? collection)
      (and (settings/remote-sync-transforms)
           (transforms-namespace-collection? collection))))

(defn- hydrate-table-details
  "Hydrates details for a Table. For tables, table_id and table_name refer to themselves."
  [id]
  (when-let [table (t2/select-one [:model/Table :name :collection_id] :id id)]
    (assoc table :table_id id :table_name (:name table))))

(defn- track-published-tables-in-collection!
  "When a collection becomes remote-synced, find all published tables in it
   and create 'create' entries for them in RemoteSyncObject (if not already tracked)."
  [collection-id]
  (let [published-tables (t2/select :model/Table
                                    :collection_id collection-id
                                    :is_published true)]
    (doseq [table published-tables]
      (let [existing (t2/select-one :model/RemoteSyncObject
                                    :model_type "Table"
                                    :model_id (:id table))]
        ;; Only create entry if not already tracked or was marked as removed/synced
        (when (or (nil? existing)
                  (contains? #{"removed" "synced"} (:status existing)))
          (log/infof "Creating remote sync object entry for published table %s in newly remote-synced collection %s"
                     (:id table) collection-id)
          (create-or-update-remote-sync-object-entry! "Table" (:id table) "create" hydrate-table-details))))))

(methodical/defmethod events/publish-event! ::collection-change-event
  [topic event]
  (let [{:keys [object]} event
        should-sync? (should-sync-collection? object)
        is-remote-synced? (collections/remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id object))
        was-synced? (and existing-entry
                         (not (contains? #{"removed"} (:status existing-entry))))
        status (if (:archived object)
                 "delete"
                 (case topic
                   :event/collection-create "create"
                   :event/collection-update "update"))]
    (cond
      ;; Collection should be synced (remote-synced or transforms-namespace with setting enabled)
      should-sync?
      (do
        (log/infof "Creating remote sync object entry for collection %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) status hydrate-collection-details)
        ;; If collection just became remote-synced, track all published tables in it
        ;; (only for actual remote-synced collections, not transforms-namespace)
        (when (and is-remote-synced? (not was-synced?))
          (track-published-tables-in-collection! (:id object)))
        ;; When a transforms-namespace collection is archived, also mark child transforms for deletion
        (when (and (:archived object) (transforms-namespace-collection? object))
          (let [transform-ids (t2/select-pks-set :model/Transform :collection_id (:id object))]
            (doseq [transform-id transform-ids]
              (log/infof "Marking transform %s for deletion (parent collection archived)" transform-id)
              (create-or-update-remote-sync-object-entry! "Transform" transform-id "delete"
                                                          (fn [id] (t2/select-one [:model/Transform :name [:collection_id :model_collection_id]] :id id)))))))

      ;; Collection was synced but no longer should be - mark as removed
      (and existing-entry (not should-sync?))
      (do
        (log/infof "Collection %s no longer needs syncing, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) "removed" hydrate-collection-details)))))
