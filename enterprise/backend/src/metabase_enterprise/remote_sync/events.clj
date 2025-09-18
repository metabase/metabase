(ns metabase-enterprise.remote-sync.events
  "Event system for remote sync operations and model change tracking.

   Provides event publishing and handling for remote sync operations,
   allowing components to react to remote sync state changes.

   Also tracks changes to models (cards, dashboards, documents, collections)
   that are part of remote-synced collections."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Define our base event type that derives from the core :metabase/event
(derive ::remote-sync-event :metabase/event)

;; Define the specific remote-sync event type
(derive :event/remote-sync ::remote-sync-event)

(defn- log-sync-event!
  "Log a sync event to the remote_sync_change_log table.

   Args:
       event (map): Event data map containing sync information.
           sync-type (str): Type of sync operation performed.
           status (str): Status of the sync operation.
           source-branch (str, optional): Source branch name.
           target-branch (str, optional): Target branch name.
           collection-id (str, optional): Entity id of the collection
           message (str, optional): Optional message or error details."
  [{:keys [sync-type status source-branch target-branch message collection-id]}]
  (t2/insert! :model/RemoteSyncChangeLog
              {:sync_type sync-type
               :source_branch source-branch
               :target_branch target-branch
               :model_type (when collection-id "Collection")
               :model_entity_id collection-id
               :status status
               :message message}))

(defn publish-remote-sync!
  "Publish a remote sync event with the given sync data.

   Args:
       sync-type (str): Type of sync (\"import\", \"export\").
       collection-id (string, optional): Entity ID of the collection being synced. Optional for import/export operations.
       user-id (int, optional): ID of the user triggering the sync.
       metadata (map, optional): Additional sync metadata. Can include :branch, :status, :message.

   Returns:
       map: The published event data.

   Examples:
       (publish-remote-sync! \"import\" nil \"entity\" {:branch \"main\" :status \"success\"})
       (publish-remote-sync! \"export\" nil \"entity\" {:branch \"feature-branch\" :status \"error\" :message \"Network timeout\"})"
  [sync-type collection-id user-id & [metadata]]
  (events/publish-event! :event/remote-sync
                         (merge {:sync-type sync-type
                                 :collection-id collection-id
                                 :user-id user-id
                                 :timestamp (t/instant)}
                                metadata)))

;; Event handler for all remote sync events
(methodical/defmethod events/publish-event! ::remote-sync-event
  [topic event]
  (log-sync-event! event)
  (log/infof "Remote sync event: %s - Collection %s (sync-type: %s, user: %s)"
             topic
             (:collection-id event)
             (:sync-type event)
             (:user-id event)))

 ;; Helper functions for model change tracking

(defn- model-in-remote-synced-collection?
  "Check if a model (card, dashboard, document) is in a remote-synced collection.

   Args:
       model (map): The model instance with collection_id field.
           collection_id (int): ID of the collection containing the model.

   Returns:
       bool: True if the model is in a remote-synced collection, false otherwise."
  [{:keys [collection_id]}]
  (boolean
   (collections/remote-synced-collection? collection_id)))

(defn- create-remote-sync-change-log-entry!
  "Create a remote sync change log entry for a model change.

   Args:
       model-type (str): Type of model ('card', 'dashboard', 'document', 'collection').
       model-entity-id (int): ENTITY ID of the affected entity.
       sync-type (str): Type of change ('create', 'update', 'delete', 'touch').
       user-id (int, optional): ID of the user making the change. Defaults to current user.

   Returns:
       map: The created change log entry."
  [model-type model-entity-id sync-type & [user-id]]
  (let [user-id (or user-id api/*current-user-id*)]
    (t2/insert! :model/RemoteSyncChangeLog
                {:model_type model-type
                 :model_entity_id (str model-entity-id)
                 :sync_type sync-type
                 :source_branch nil
                 :target_branch nil
                 :most_recent true
                 :status "success"
                 :message (format "%s %s by user %s" (name sync-type) model-type user-id)})))

;; Model change tracking event handlers

;; Card events
(derive ::card-change-event :metabase/event)
(derive :event/card-create ::card-change-event)
(derive :event/card-update ::card-change-event)
(derive :event/card-delete ::card-change-event)

(methodical/defmethod events/publish-event! ::card-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (if (:archived object)
                    "delete"
                    (case topic
                      :event/card-create "create"
                      :event/card-update "update"
                      :event/card-delete "delete"))]
    (when (model-in-remote-synced-collection? object)
      (log/infof "Creating remote sync change log entry for card %s (action: %s)" (:id object) sync-type)
      (create-remote-sync-change-log-entry! "Card" (:entity_id object) sync-type user-id))))

;; Dashboard events
(derive ::dashboard-change-event :metabase/event)
(derive :event/dashboard-create ::dashboard-change-event)
(derive :event/dashboard-update ::dashboard-change-event)
(derive :event/dashboard-delete ::dashboard-change-event)

(methodical/defmethod events/publish-event! ::dashboard-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (if (:archived object)
                    "delete"
                    (case topic
                      :event/dashboard-create "create"
                      :event/dashboard-update "update"
                      :event/dashboard-delete "delete"))]
    (when (model-in-remote-synced-collection? object)
      (log/infof "Creating remote sync change log entry for dashboard %s (action: %s)" (:id object) sync-type)
      (create-remote-sync-change-log-entry! "Dashboard" (:entity_id object) sync-type user-id))))

;; Document events
(derive ::document-change-event :metabase/event)
(derive :event/document-create ::document-change-event)
(derive :event/document-update ::document-change-event)
(derive :event/document-delete ::document-change-event)

(methodical/defmethod events/publish-event! ::document-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (if (:archived object)
                    "delete"
                    (case topic
                      :event/document-create "create"
                      :event/document-update "update"
                      :event/document-delete "delete"))]
    (when (model-in-remote-synced-collection? object)
      (log/infof "Creating remote sync change log entry for document %s (action: %s)" (:id object) sync-type)
      (create-remote-sync-change-log-entry! "Document" (:entity_id object) sync-type user-id))))

;; Collection touch events
(derive ::collection-touch-event :metabase/event)
(derive :event/collection-touch ::collection-touch-event)

(methodical/defmethod events/publish-event! ::collection-touch-event
  [topic event]
  (let [{:keys [object user-id]} event
        sync-type (if (:archived object)
                    "delete"
                    (case topic
                      :event/collection-touch-event "update"))]
    (when (collections/remote-synced-collection? object)
      (log/infof "Creating remote sync change log entry for collection touch %s" (:id object))
      (create-remote-sync-change-log-entry! "Collection" (:entity_id object) sync-type user-id))))
