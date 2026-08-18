(ns metabase-enterprise.content-diagnostics.events
  "Keep content-diagnostics findings consistent with entity lifecycle. When a flagged entity is archived
  (card/dashboard/document), a collection subtree is archived, or a transform is deleted, its active
  findings are invalidated so it drops out of the served set immediately instead of lingering until the
  next scan."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(defn- invalidate-entity!
  "Invalidate one entity's findings."
  [entity-type entity-id]
  (when (premium-features/has-feature? :content-diagnostics)
    (try
      (finding/invalidate-for-entity! entity-type entity-id)
      (catch Throwable e
        (log/error e "Failed to invalidate content-diagnostics findings for entity"
                   {:entity-type entity-type :entity-id entity-id})))))

(defn- invalidate-collection-subtree!
  [collection]
  (when (premium-features/has-feature? :content-diagnostics)
    (try
      (finding/invalidate-for-collection-subtree!
       (conj (collection/descendant-ids collection) (:id collection)))
      (catch Throwable e
        (log/error e "Failed to invalidate content-diagnostics findings for collection subtree"
                   {:collection-id (:id collection)})))))

;; ### Cards - archived via `PUT /api/card/:id` (`:event/card-update` fires on every update)
(events/derive! ::card-archived :metabase/event)
(events/derive! :event/card-update ::card-archived)

(methodical/defmethod events/publish-event! ::card-archived
  [_ {:keys [object]}]
  (when (:archived object)
    (invalidate-entity! :card (:id object))))

;; ### Dashboards - archived via `PUT /api/dashboard/:id` (`:event/dashboard-update` fires on every update)
(events/derive! ::dashboard-archived :metabase/event)
(events/derive! :event/dashboard-update ::dashboard-archived)

(methodical/defmethod events/publish-event! ::dashboard-archived
  [_ {:keys [object]}]
  (when (:archived object)
    (invalidate-entity! :dashboard (:id object))))

;; ### Collections - archived via `PUT /api/collection/:id`. Archiving cascades to the whole subtree
;; without emitting per-descendant events, so invalidate the subtree (self + descendants) here.
(events/derive! ::collection-archived :metabase/event)
(events/derive! :event/collection-update ::collection-archived)

(methodical/defmethod events/publish-event! ::collection-archived
  [_ {:keys [object]}]
  (when (:archived object)
    (invalidate-collection-subtree! object)))

;; ### Documents - archiving publishes `:event/document-delete` (its own signal, not the after-update hook)
(events/derive! ::document-deleted :metabase/event)
(events/derive! :event/document-delete ::document-deleted)

(methodical/defmethod events/publish-event! ::document-deleted
  [_ {:keys [object]}]
  (invalidate-entity! :document (:id object)))

;; ### Transforms - not archivable; hard `DELETE /api/transform/:id` publishes `:event/transform-delete`
(events/derive! ::transform-deleted :metabase/event)
(events/derive! :event/transform-delete ::transform-deleted)

(methodical/defmethod events/publish-event! ::transform-deleted
  [_ {:keys [object]}]
  (invalidate-entity! :transform (:id object)))
