(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.crowded
  "The `crowded` imbalanced checker: too much content, across collections, dashboards, and documents.
  Runs independently of `empty`/`sparse`, so an entity can be flagged by more than one (a many-tab
  dashboard with 0 dashcards is both `crowded` and `empty`).

  What counts as crowded:
  - Collection: more direct items than the limit.
  - Dashboard: too many dashcards on a single tab, or - only if that passes - too many tabs. Checking
    dashcards-per-tab first means a dashboard gets at most one `crowded` finding; a tabless dashboard
    counts as one tab. (Per-tab counting is crowded-only, so this checker runs its own grouped query
    rather than reusing the shared across-tabs total.)
  - Document: more embedded cards than the limit.

  Each finding records the measured amount and the limit it crossed. Set-based, reads only the app DB."
  (:require
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide `crowded` findings across collections, dashboards, and documents. A dashboard is checked
  dashcards-per-tab first, then tab count, so it gets at most one `crowded` finding; a tabless dashboard
  counts as one tab."
  []
  (let [crowded-collection-items  (cd.settings/content-diagnostics-crowded-collection-threshold-items)
        crowded-dashcards-per-tab (cd.settings/content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab)
        crowded-tabs              (cd.settings/content-diagnostics-crowded-dashboard-threshold-tabs)
        crowded-document-cards    (cd.settings/content-diagnostics-crowded-document-threshold-cards)
        dashcard-groups           (group-by :dashboard_id
                                            (t2/query {:select   [:dashboard_id :dashboard_tab_id
                                                                  [[:count :*] :cnt]]
                                                       :from     [:report_dashboardcard]
                                                       :group-by [:dashboard_id :dashboard_tab_id]}))
        tab-counts                (u/index-by :dashboard_id :cnt
                                              (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
                                                         :from     [:dashboard_tab]
                                                         :group-by [:dashboard_id]}))]
    (common/attach-entity-attrs
     (concat
      (let [collections (shared/eligible-collections)
            counts      (shared/direct-item-counts collections)]
        (for [{:keys [id]} collections
              :let  [n (long (get counts id 0))]
              :when (> n crowded-collection-items)]
          (shared/finding :collection id :crowded n {:threshold crowded-collection-items :unit "items"})))
      (for [{:keys [id]} (shared/active-dashboards)
            :let  [tab-rows    (get dashcard-groups id)
                   max-per-tab (transduce (map :cnt) max 0 tab-rows)
                   tabs        (max 1 (long (get tab-counts id 0)))
                   verdict     (cond
                                 (> max-per-tab crowded-dashcards-per-tab)
                                 (shared/finding :dashboard id :crowded max-per-tab
                                                 {:threshold crowded-dashcards-per-tab :unit "dashcards"})

                                 (> tabs crowded-tabs)
                                 (shared/finding :dashboard id :crowded tabs
                                                 {:threshold crowded-tabs :unit "tabs"}))]
            :when verdict]
        verdict)
      (for [doc   (shared/active-documents)
            :when (= (:content_type doc) prose-mirror/prose-mirror-content-type)
            :let  [n (count (prose-mirror/card-ids doc))]
            :when (> n crowded-document-cards)]
        (shared/finding :document (:id doc) :crowded n {:threshold crowded-document-cards :unit "cards"}))))))
