(ns metabase-enterprise.content-diagnostics.checkers.stale
  "The `stale` Content Diagnostics checker - instance-wide inactive content across every covered entity
  type, sourced from the stale module's staleness-rule entry point and narrowed to eligible containers
  here (the stale query arms are shared with the standalone stale tool). Freezes the staleness threshold
  and the per-entity activity anchor at scan time (drift between scans is acceptable)."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   ;; sanctioned export: find-candidates is the stale module's public staleness-rule entry point
   ;; (see enterprise/stale :api in .clj-kondo/config/modules/config.edn).
   [metabase-enterprise.stale.impl :as stale.impl]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide stale candidates for every covered entity type as finding maps, dropping
  card/dashboard/document candidates in ineligible containers (transforms are exempt - they run
  regardless of their folder's state). `:entity-name` and the activity anchor come from the stale query;
  the remaining denormalized attrs are filled by `common/attach-entity-attrs`."
  []
  (let [threshold (cd.settings/content-diagnostics-stale-threshold-days)
        cutoff    (t/minus (t/local-date) (t/days threshold))
        {:keys [rows]} (stale.impl/find-candidates
                        {:collection-ids  :all
                         ;; explicit, NOT (vals common/entity-type->model): find-candidates throws on
                         ;; models with no find-stale-query method, and :model/Collection has none
                         :models          #{:model/Card :model/Dashboard :model/Document :model/Transform}
                         ;; name + recency come from the stale query - the per-model recency source
                         ;; stays single-sourced in the `find-stale-query` arms; collection_id feeds
                         ;; the container post-filter below.
                         :include-columns #{:name :last_used_at :collection_id}
                         :cutoff-date     cutoff
                         :limit           nil
                         :offset          nil
                         :sort-column     :name
                         :sort-direction  :asc})
        ;; post-filter rather than a WHERE in the shared arms; safe because :limit is nil (no page to
        ;; backfill). Also closes the arms' sample-content gap (they never check is_sample).
        eligible-container-ids (t2/select-pks-set :model/Collection {:where common/eligible-collection-where})]
    (common/attach-entity-attrs
     (for [{:keys [id model collection_id last_used_at] entity-name :name} rows
           :let  [entity-type (common/model->entity-type model)]
           ;; transforms are container-exempt: they execute regardless of their folder's state, so a
           ;; stale transform in an archived folder is a retirement candidate, not noise
           :when (and entity-type
                      (or (= entity-type :transform)
                          (nil? collection_id)
                          (contains? eligible-container-ids collection_id)))]
       {:entity-type    entity-type
        :entity-id      id
        :finding-type   :stale
        ;; scan-time activity anchor (the stale query aliases each model's recency column to
        ;; `last_used_at`); nil ⇒ never used/ran
        :last-active-at last_used_at
        ;; denormalized at scan time - the sort/display name; drift between scans is acceptable
        :entity-name    entity-name
        :details        {:threshold_days threshold}}))))
