(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.sparse
  "The `sparse` imbalanced checker: a little content, but not none, across collections and dashboards.
  Runs independently of `empty`/`crowded`. The rule floors at 1 (`0 < n < limit`), so a zero-count
  subject belongs to `empty` alone - though a sparse entity can still be `crowded` on another axis (a
  6-tab dashboard with 2 dashcards is both).

  What counts as sparse:
  - Collection: between 1 and the limit direct items (empty items still count).
  - Dashboard: between 1 and the limit dashcards total across tabs.

  Each finding records the measured count and the limit. Set-based, reads only the app DB."
  (:require
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide `sparse` findings across collections and dashboards. Sparse means a little content, not
  none: the rule floors at 1, so a zero-count subject belongs to `empty` alone."
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
