(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.crowded
  "The `crowded` imbalanced checker - too much content, across collection, dashboard, and document.
  Independent of `empty`/`sparse`: an entity flagged here can also be flagged by them (a many-tab
  dashboard with 0 dashcards is both `crowded` and `empty`).

  - **Collection:** raw direct item count > bound.
  - **Dashboard:** too many dashcards on one tab, or - only if that passes - too many tabs. This is a
    WITHIN-type precedence (dashcards-per-tab before tabs), so an entity gets at most one `crowded`
    finding; a tabless dashboard counts as one implicit tab. Per-tab counting is crowded-only (sparse
    counts across tabs), so this checker runs its own grouped query rather than the shared total.
  - **Document:** too many embedded cards.

  Each finding stamps the measured magnitude in `content-count` and freezes `{:threshold, :unit}`;
  thresholds are read once at the start. Set-based, app-db only; display attrs via
  `common/attach-entity-attrs`."
  (:require
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn checker
  "Instance-wide `crowded` finding maps across collection, dashboard, and document. The dashboard rule
  keeps its within-type precedence - dashcards-on-one-tab first, then tab count - so an entity gets at
  most one `crowded` finding; a tabless dashboard counts as one implicit tab."
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
