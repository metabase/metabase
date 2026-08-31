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

(defn- invalidate!
  "Run `invalidate-thunk`, logging a failure instead of rethrowing it - `publish-event!` would otherwise fail
  the archive that triggered it."
  [log-ctx invalidate-thunk]
  (try
    (invalidate-thunk)
    (catch Throwable e
      (log/error e "Failed to invalidate content-diagnostics findings" log-ctx))))

(defn- invalidate-entity!
  "Invalidate one entity's findings."
  [entity-type entity-id]
  (invalidate! {:entity-type entity-type :entity-id entity-id}
               #(finding/invalidate-for-entity! entity-type entity-id)))

(defn- invalidate-collection-subtree!
  "Invalidate the findings of a collection subtree (self + descendants)."
  [{collection-id :id :as collection}]
  (invalidate! {:collection-id collection-id}
               #(finding/invalidate-for-collection-subtree!
                 (conj (collection/descendant-ids collection) collection-id))))

;; ### Cards - archived via `PUT /api/card/:id` (`:event/card-update` fires on every update)
(events/derive! ::card-archived :metabase/event)
(events/derive! :event/card-update ::card-archived)

(methodical/defmethod events/publish-event! ::card-archived
  [_ {:keys [object]}]
  (when (and (premium-features/has-feature? :content-diagnostics) (:archived object))
    (invalidate-entity! :card (:id object))))

;; ### Dashboards - archived via `PUT /api/dashboard/:id` (`:event/dashboard-update` fires on every update)
(events/derive! ::dashboard-archived :metabase/event)
(events/derive! :event/dashboard-update ::dashboard-archived)

(methodical/defmethod events/publish-event! ::dashboard-archived
  [_ {:keys [object]}]
  (when (and (premium-features/has-feature? :content-diagnostics) (:archived object))
    (invalidate-entity! :dashboard (:id object))))

;; ### Collections - archived via `PUT /api/collection/:id`. Archiving cascades to the whole subtree
;; without emitting per-descendant events, so invalidate the subtree (self + descendants) here.
(events/derive! ::collection-archived :metabase/event)
(events/derive! :event/collection-update ::collection-archived)

(methodical/defmethod events/publish-event! ::collection-archived
  [_ {:keys [object]}]
  (when (and (premium-features/has-feature? :content-diagnostics) (:archived object))
    (invalidate-collection-subtree! object)))

;; ### Documents - archiving publishes `:event/document-delete` (its own signal, not the after-update hook)
(events/derive! ::document-deleted :metabase/event)
(events/derive! :event/document-delete ::document-deleted)

(methodical/defmethod events/publish-event! ::document-deleted
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :content-diagnostics)
    (invalidate-entity! :document (:id object))))

;; ### Transforms - not archivable; hard `DELETE /api/transform/:id` publishes `:event/transform-delete`
(events/derive! ::transform-deleted :metabase/event)
(events/derive! :event/transform-delete ::transform-deleted)

(methodical/defmethod events/publish-event! ::transform-deleted
  [_ {:keys [object]}]
  (when (premium-features/has-feature? :content-diagnostics)
    (invalidate-entity! :transform (:id object))))
