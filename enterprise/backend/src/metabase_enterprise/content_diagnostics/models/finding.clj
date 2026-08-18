(ns metabase-enterprise.content-diagnostics.models.finding
  "Toucan model for `content_diagnostics_finding` — a detected problem for one entity, from one scan run.
  Scan-snapshot, latest-wins; a stamped `invalidated_at` evicts a superseded/invalidated finding from the
  served set (NULL = active)."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ContentDiagnosticsFinding [_model] :content_diagnostics_finding)

(doto :model/ContentDiagnosticsFinding
  (derive :metabase/model))

(t2/deftransforms :model/ContentDiagnosticsFinding
  {:entity_type  mi/transform-keyword
   :finding_type mi/transform-keyword
   ;; nullable - card findings only
   :card_type    mi/transform-keyword
   :details      mi/transform-json})

(defn invalidate-superseded!
  "Soft-invalidate (stamp `invalidated_at`, never delete) every still-active finding of `finding-types`
  from a *prior* scan. Entities the new scan re-flagged keep a newer active row; entities it no longer
  flags drop out of the active set. Filtering on `invalidated_at` NULL keeps this idempotent."
  [scan-id finding-types]
  (when (seq finding-types)
    (t2/update! :model/ContentDiagnosticsFinding
                {:scan_id        [:not= scan-id]
                 :finding_type   [:in finding-types]
                 :invalidated_at nil}
                {:invalidated_at (mi/now)})))

(defn invalidate-for-entity!
  "Soft-invalidate every still-active finding for a single entity (`entity-type` + `entity-id`) - e.g. when
  the entity is archived or deleted through any path."
  [entity-type entity-id]
  (t2/update! :model/ContentDiagnosticsFinding
              {:entity_type    entity-type
               :entity_id      entity-id
               :invalidated_at nil}
              {:invalidated_at (mi/now)}))

(defn invalidate-for-collection-subtree!
  "Soft-invalidate active findings dropped when a collection subtree is archived: the archived collections
  themselves and every entity scanned inside them."
  [collection-ids]
  (when (seq collection-ids)
    (t2/update! :model/ContentDiagnosticsFinding
                {:entity_type    :collection
                 :entity_id      [:in collection-ids]
                 :invalidated_at nil}
                {:invalidated_at (mi/now)})
    (t2/update! :model/ContentDiagnosticsFinding
                {:scope_collection_id [:in collection-ids]
                 :invalidated_at      nil}
                {:invalidated_at (mi/now)})))
