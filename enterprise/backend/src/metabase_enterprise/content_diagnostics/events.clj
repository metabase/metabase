(ns metabase-enterprise.content-diagnostics.events
  "Keep content-diagnostics findings consistent with entity lifecycle. When a flagged entity is archived
  (card/dashboard/document) or deleted, or a collection subtree is archived, its active findings are invalidated so it
  drops out of the served set immediately instead of lingering until the next scan."
  (:require
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def ^:private entity-types
  "The entity type of the findings of each model that has them."
  {:model/Card      :card
   :model/Dashboard :dashboard
   :model/Document  :document
   :model/Transform :transform})

(defn- invalidate!
  "Run `invalidate-thunk`, logging a failure instead of rethrowing it, so it does not fail the write."
  [log-ctx invalidate-thunk]
  (try
    (invalidate-thunk)
    (catch Throwable e
      (log/errorf "Failed to invalidate content-diagnostics findings %s: %s" log-ctx (ex-message e)))))

(events/derive! ::event :metabase/event)
(doseq [topic [:event/card-update       :event/card-delete
               :event/dashboard-update  :event/dashboard-delete
               :event/document-update   :event/document-delete
               :event/transform-update  :event/transform-delete
               :event/collection-update :event/collection-delete]]
  (events/derive! topic ::event))

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [object previous-object] :as event}]
  (when (premium-features/has-feature? :content-diagnostics)
    (let [row       (or object previous-object)
          model     (t2/model row)
          deleted?  (nil? object)
          archived? (and (true? (:archived object)) (u.events/changed? event :archived))]
      (cond
        (and (= :model/Collection model) archived?)
        (invalidate! {:collection-id (:id row)}
                     #(finding/invalidate-for-collection-subtree!
                       (conj (collection/descendant-ids row) (:id row))))

        (and (entity-types model) (or deleted? archived?))
        (invalidate! {:entity-type (entity-types model) :entity-id (:id row)}
                     #(finding/invalidate-for-entity! (entity-types model) (:id row)))))))
