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
  "Checks if a model (card, dashboard, document) is in a remote-synced collection. Takes a model instance with a
  collection_id field. Returns true if the model is in a remote-synced collection, false otherwise."
  [{:keys [collection_id]}]
  (boolean
   (collections/remote-synced-collection? collection_id)))

(defmulti ^:private remote-sync-model-details
  "Returns a map of relevant fields for the model."
  {:arglists '([model-type model-id])}
  (fn [model-type _model-id] model-type))

(defmethod remote-sync-model-details "Card"
  [_model-type model-id]
  (t2/select-one [:model/Card :name :collection_id :display] :id model-id))

(defmethod remote-sync-model-details "Dashboard"
  [_model-type model-id]
  (t2/select-one [:model/Dashboard :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "Document"
  [_model-type model-id]
  (t2/select-one [:model/Document :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "NativeQuerySnippet"
  [_model-type model-id]
  (t2/select-one [:model/NativeQuerySnippet :name :id] :id model-id))

(defmethod remote-sync-model-details "Timeline"
  [_model-type model-id]
  (t2/select-one [:model/Timeline :name :collection_id] :id model-id))

(defmethod remote-sync-model-details "Collection"
  [_model-type model-id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id model-id))

(defn- create-or-update-remote-sync-object-entry!
  "Creates or updates a remote sync object entry for a model change. Takes a model-type (type of model: 'Card',
  'Dashboard', 'Document', 'Collection'), a model-id (ID of the affected model), a status (status of the sync:
  'create', 'update', 'removed', 'delete', 'error', 'synced'), and an optional user-id (ID of the user making
  the change). Returns the created or updated remote sync object entry."
  [model-type model-id status & [_user-id]]
  (let [existing (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id)]
    (cond
      (not existing)
      (let [model-details (remote-sync-model-details model-type model-id)]
        (t2/insert! :model/RemoteSyncObject
                    {:model_type model-type
                     :model_id model-id
                     :model_name (:name model-details)
                     :model_collection_id (:collection_id model-details)
                     :model_display (some-> model-details :display name)
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
      (let [model (remote-sync-model-details model-type model-id)]
        (t2/update! :model/RemoteSyncObject (:id existing)
                    {:status status
                     :status_changed_at (t/offset-date-time)
                     :model_name (:name model)
                     :model_collection_id (:collection_id model)
                     :model_display (some-> model :display name)})))))

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
                 "delete"
                 (case topic
                   :event/card-create "create"
                   :event/card-update "update"
                   :event/card-delete "delete"))]
    (cond
      ;; Card is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for card %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Card" (:id object) status user-id))

      ;; Card was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Card %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Card" (:id object) "removed" user-id)))))

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
                 "delete"
                 (case topic
                   :event/dashboard-create "create"
                   :event/dashboard-update "update"
                   :event/dashboard-delete "delete"))]
    (cond
      ;; Dashboard is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for dashboard %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Dashboard" (:id object) status user-id))

      ;; Dashboard was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Dashboard %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Dashboard" (:id object) "removed" user-id)))))

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
                 "delete"
                 (case topic
                   :event/document-create "create"
                   :event/document-update "update"
                   :event/document-delete "delete"))]
    (cond
      ;; Document is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for document %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Document" (:id object) status user-id))

      ;; Document was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Document %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Document" (:id object) "removed" user-id)))))

;; Native query snippet events
(derive ::snippet-change-event :metabase/event)
(derive :event/snippet-create ::snippet-change-event)
(derive :event/snippet-update ::snippet-change-event)
(derive :event/snippet-delete ::snippet-change-event)

(methodical/defmethod events/publish-event! ::snippet-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        in-remote-synced? (model-in-remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "NativeQuerySnippet" :model_id (:id object))
        status (if (:archived object)
                 "delete"
                 (case topic
                   :event/snippet-create "create"
                   :event/snippet-update "update"
                   :event/snippet-delete "delete"))]
    (cond
      ;; Snippet is in a remote-synced collection - create or update entry
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for snippet %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "NativeQuerySnippet" (:id object) status user-id))

      ;; Snippet was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Snippet %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "NativeQuerySnippet" (:id object) "removed" user-id)))))

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
                 "delete"
                 (case topic
                   :event/collection-create "create"
                   :event/collection-update "update"))]
    (cond
      ;; Collection is remote-synced - create or update entry
      is-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for collection %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) status user-id))

      ;; Collection was remote-synced but type changed - mark as removed
      (and existing-entry (not is-remote-synced?))
      (do
        (log/infof "Collection %s type changed from remote-synced, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Collection" (:id object) "removed" user-id)))))

;; Timeline events
(derive ::timeline-change-event :metabase/event)
(derive :event/timeline-create ::timeline-change-event)
(derive :event/timeline-update ::timeline-change-event)
(derive :event/timeline-delete ::timeline-change-event)

(methodical/defmethod events/publish-event! ::timeline-change-event
  [topic event]
  (let [{:keys [object user-id]} event
        in-remote-synced? (model-in-remote-synced-collection? object)
        existing-entry (t2/select-one :model/RemoteSyncObject :model_type "Timeline" :model_id (:id object))
        status (if (:archived object)
                 "delete"
                 (case topic
                   :event/timeline-create "create"
                   :event/timeline-update "update"
                   :event/timeline-delete "delete"))]
    (cond
      in-remote-synced?
      (do
        (log/infof "Creating remote sync object entry for timeline %s (status: %s)" (:id object) status)
        (create-or-update-remote-sync-object-entry! "Timeline" (:id object) status user-id))

      ;; Timeline was tracked but moved out of remote-synced collection - mark as removed
      (and existing-entry (not in-remote-synced?))
      (do
        (log/infof "Timeline %s moved out of remote-synced collection, marking as removed" (:id object))
        (create-or-update-remote-sync-object-entry! "Timeline" (:id object) "removed" user-id)))))
