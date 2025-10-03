(ns metabase-enterprise.remote-sync.events
  "Event system for remote sync operations and model change tracking.

   Provides event publishing and handling for remote sync operations,
   allowing components to react to remote sync state changes.

   Also tracks changes to models (cards, dashboards, documents, collections)
   that are part of remote-synced collections."
  (:require
   [java-time.api :as t]
   [metabase.collections.core :as collections]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

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

(defn- create-remote-sync-object-entry!
  "Create or update a remote sync object entry for a model change.

   Args:
       model-type (str): Type of model ('Card', 'Dashboard', 'Document', 'Collection').
       model-id (int): ID of the affected model.
       status (str): Status of the sync ('created', 'updated', 'removed', 'deleted', 'error', 'synced').
       user-id (int, optional): ID of the user making the change. Defaults to current user.

   Returns:
       map: The created or updated remote sync object entry."
  [model-type model-id status & [_user-id]]
  (let [existing (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      (or (and existing (not= "created" (:status existing)))
          (and (= "created" (:status existing)) (= "removed" status)))
      (t2/update! :model/RemoteSyncObject (:id existing)
                  {:status status
                   :status_changed_at (t/offset-date-time)})

      (not existing)
      (t2/insert! :model/RemoteSyncObject
                  {:model_type      model-type
                   :model_id        model-id
                   :status          status
                   :status_changed_at (t/offset-date-time)}))))

;; Model change tracking event handlers

;; Card events
(derive ::card-change-event :metabase/event)
(derive :event/card-create ::card-change-event)
(derive :event/card-update ::card-change-event)
(derive :event/card-delete ::card-change-event)

(methodical/defmethod events/publish-event! ::card-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        in-remote-synced? (model-in-remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Card" :model_id (:id object))
        status (if (:archived object)
                 "deleted"
                 (case topic
                   :event/card-create "created"
                   :event/card-update "updated"
                   :event/card-delete "deleted"))]
    (cond
      ;; Card is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for card %s (status: %s)" (:id object) status)
        (create-remote-sync-object-entry! "Card" (:id object) status user-id))

      ;; Card was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Card %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-remote-sync-object-entry! "Card" (:id object) "removed" user-id)))))

;; Dashboard events
(derive ::dashboard-change-event :metabase/event)
(derive :event/dashboard-create ::dashboard-change-event)
(derive :event/dashboard-update ::dashboard-change-event)
(derive :event/dashboard-delete ::dashboard-change-event)

(methodical/defmethod events/publish-event! ::dashboard-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        in-remote-synced? (model-in-remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Dashboard" :model_id (:id object))
        status (if (:archived object)
                 "deleted"
                 (case topic
                   :event/dashboard-create "created"
                   :event/dashboard-update "updated"
                   :event/dashboard-delete "deleted"))]
    (cond
      ;; Dashboard is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for dashboard %s (status: %s)" (:id object) status)
        (create-remote-sync-object-entry! "Dashboard" (:id object) status user-id))

      ;; Dashboard was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Dashboard %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-remote-sync-object-entry! "Dashboard" (:id object) "removed" user-id)))))

;; Document events
(derive ::document-change-event :metabase/event)
(derive :event/document-create ::document-change-event)
(derive :event/document-update ::document-change-event)
(derive :event/document-delete ::document-change-event)

(methodical/defmethod events/publish-event! ::document-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        in-remote-synced? (model-in-remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Document" :model_id (:id object))
        status (if (:archived object)
                 "deleted"
                 (case topic
                   :event/document-create "created"
                   :event/document-update "updated"
                   :event/document-delete "deleted"))]
    (cond
      ;; Document is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for document %s (status: %s)" (:id object) status)
        (create-remote-sync-object-entry! "Document" (:id object) status user-id))

      ;; Document was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Document %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-remote-sync-object-entry! "Document" (:id object) "removed" user-id)))))

;; Collection create/update events - derive from common parent for shared handling
(derive ::collection-change-event :metabase/event)
(derive :event/collection-create ::collection-change-event)
(derive :event/collection-update ::collection-change-event)

(methodical/defmethod events/publish-event! ::collection-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        is-remote-synced? (collections/remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Collection" :model_id (:id object))
        status (if (:archived object)
                 "deleted"
                 (case topic
                   :event/collection-create "created"
                   :event/collection-update "updated"))]
    (cond
      ;; Collection is remote-synced - create or update entry
      is-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for collection %s (status: %s)" (:id object) status)
        (create-remote-sync-object-entry! "Collection" (:id object) status user-id))

      ;; Collection was remote-synced but type changed - mark as removed
      (and existing-entry (not is-remote-synced?))
      (do
        (log/infof "Collection %s type changed from remote-synced, marking as removed" (:id object))
        (create-remote-sync-object-entry! "Collection" (:id object) "removed" user-id)))))
