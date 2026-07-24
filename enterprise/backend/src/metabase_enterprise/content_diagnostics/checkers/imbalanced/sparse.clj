(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.sparse
  "The `sparse` imbalanced checker - a little content, not none, across collection and dashboard.
  Independent of `empty`/`crowded`: the rule floors at 1 (`0 < n < bound`), so a zero-count subject is
  the `empty` checker's alone, but a sparse entity can also be `crowded` on a different axis (a 6-tab
  dashboard holding 2 dashcards is both).

  - **Collection:** 0 < raw direct item count < bound (empty items still count).
  - **Dashboard:** 0 < dashcards **total** across tabs < bound.

  Each finding stamps the measured count in `content-count` and freezes `{:threshold, :unit}`;
  thresholds are read once at the start. Set-based, app-db only; display attrs via
  `common/attach-entity-attrs`."
  (:require
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide `sparse` finding maps across collection and dashboard. Sparse means a little content,
  not none: the rule floors at 1, so a zero-count subject is the `empty` checker's alone."
  []
  (let [sparse-collection-items    (cd.settings/content-diagnostics-sparse-collection-threshold-items)
        sparse-dashboard-dashcards (cd.settings/content-diagnostics-sparse-dashboard-threshold-dashcards)
        dashcard-totals            (shared/dashboard-dashcard-totals)]
    (common/attach-entity-attrs
     (concat
      (let [collections (shared/eligible-collections)
            counts      (shared/direct-item-counts collections)]
        (for [{:keys [id]} collections
              :let  [n (long (get counts id 0))]
              :when (< 0 n sparse-collection-items)]
          (shared/finding :collection id :sparse n {:threshold sparse-collection-items :unit "items"})))
      (for [{:keys [id]} (shared/active-dashboards)
            :let  [total (long (get dashcard-totals id 0))]
            :when (< 0 total sparse-dashboard-dashcards)]
        (shared/finding :dashboard id :sparse total
                        {:threshold sparse-dashboard-dashcards :unit "dashcards"}))))))
