(ns metabase-enterprise.content-diagnostics.checkers.stale
  "The `stale` Content Diagnostics checker - instance-wide inactive content across every covered entity
  type, sourced from the stale module's staleness-rule entry point. Freezes the staleness threshold and
  the per-entity activity anchor at scan time (drift between scans is acceptable)."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   ;; sanctioned export: find-candidates is the stale module's public staleness-rule entry point
   ;; (see enterprise/stale :api in .clj-kondo/config/modules/config.edn).
   [metabase-enterprise.stale.impl :as stale.impl]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide stale candidates for every covered entity type as finding maps. `:entity-name` and the
  activity anchor come from the stale query; the remaining denormalized attrs are filled by
  `common/attach-entity-attrs`."
  []
  (let [threshold (cd.settings/content-diagnostics-stale-threshold-days)
        cutoff    (t/minus (t/local-date) (t/days threshold))
        {:keys [rows]} (stale.impl/find-candidates
                        {:collection-ids  :all
                         ;; explicit, NOT (vals common/entity-type->model): find-candidates throws on
                         ;; models with no find-stale-query method, and :model/Collection has none
                         :models          #{:model/Card :model/Dashboard :model/Document :model/Transform}
                         ;; name + recency come from the stale query - the per-model recency source
                         ;; stays single-sourced in the `find-stale-query` arms.
                         :include-columns #{:name :last_used_at}
                         :cutoff-date     cutoff
                         :limit           nil
                         :offset          nil
                         :sort-column     :name
                         :sort-direction  :asc})]
    (common/attach-entity-attrs
     (for [{:keys [id model last_used_at] entity-name :name} rows
           :let  [entity-type (common/model->entity-type model)]
           :when entity-type]
       {:entity-type    entity-type
        :entity-id      id
        :finding-type   :stale
        ;; scan-time activity anchor (the stale query aliases each model's recency column to
        ;; `last_used_at`); nil ⇒ never used/ran
        :last-active-at last_used_at
        ;; denormalized at scan time - the sort/display name; drift between scans is acceptable
        :entity-name    entity-name
        :details        {:threshold_days threshold}}))))
