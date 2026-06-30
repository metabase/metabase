(ns metabase-enterprise.content-diagnostics.models.finding
  "Toucan model for `content_diagnostics_finding` — a detected problem for one entity, from one scan run.
  Scan-snapshot, latest-wins; the `stale` flag evicts a superseded/invalidated finding from the served set."
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
  "Write-side resolution after a scan commits its fresh batch: soft-invalidate (set `stale = true`, stamp
  `invalidated_at`) every still-active finding of `finding-types` that came from a *prior* scan. Entities
  the new scan re-flagged keep a newer active row (served via latest-per-entity); entities it no longer
  flags have only their now-invalidated older rows and so drop out of the served set — this is what makes
  resolution work once serve switched from latest-scan-only to latest-per-entity. **Soft, not a hard
  delete** — the invalidated row is kept and flagged, never removed. Filtering on `stale false` keeps it
  idempotent and preserves the original `invalidated_at` on already-stale rows."
  [scan-id finding-types]
  (when (seq finding-types)
    (t2/update! :model/ContentDiagnosticsFinding
                {:scan_id      [:not= scan-id]
                 :finding_type [:in finding-types]
                 :stale        false}
                {:stale true :invalidated_at (mi/now)})))
