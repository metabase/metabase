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
