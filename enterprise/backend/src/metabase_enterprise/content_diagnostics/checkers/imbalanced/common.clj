(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.common
  "Shared substrate for the three imbalanced checkers (`empty`/`sparse`/`crowded`, one per sibling
  namespace). Holds the finding constructor and the app-db count/row helpers more than one of them
  needs - notably `eligible-collections` (the single definition of what a collection *subject* is, so
  the three checkers can never scan divergent collection sets). Each checker re-runs only the helpers
  it needs; these are cheap app-db aggregates, so independence is favored over threading shared results.

  Collection direct items = non-archived child collections + cards/dashboards/documents
  (collection-items semantics: dashboard/document-internal cards live inside their container, not the
  collection). Checker-specific probes (the card-run window, document AST predicates, per-tab dashcard
  grouping) live in the checker namespaces, not here."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn finding
  "The shared imbalanced finding shape: measured magnitude in the top-level `:content-count`, the
  crossed bound + its unit frozen in `details`."
  [entity-type entity-id finding-type content-count details]
  {:entity-type   entity-type
   :entity-id     entity-id
   :finding-type  finding-type
   :content-count content-count
   :details       details})

(defn collection-item-cards
  "Non-archived cards that count as direct collection items, as `{:id :collection_id}` rows -
  dashboard/document-internal cards live inside their container, not the collection."
  []
  (t2/query {:select [:id :collection_id]
             :from   [:report_card]
             :where  [:and
                      [:= :archived false]
                      [:= :dashboard_id nil]
                      [:= :document_id nil]]}))

(defn active-dashboards
  "Non-archived dashboards as `{:id :collection_id}` rows."
  []
  (t2/query {:select [:id :collection_id]
             :from   [:report_dashboard]
             :where  [:= :archived false]}))

(defn document-items
  "Non-archived documents as `{:id :collection_id}` rows - the light form for collection counting
  (no AST fetch)."
  []
  (t2/query {:select [:id :collection_id]
             :from   [(t2/table-name :model/Document)]
             :where  [:= :archived false]}))

(defn active-documents
  "Non-archived documents with their AST - for the document verdicts, which parse `:document`."
  []
  (t2/select [:model/Document :id :collection_id :document :content_type] :archived false))

(defn dashboard-dashcard-totals
  "`{dashboard-id -> primary dashcard count across all tabs}`; no row = 0. Primary dashcards only:
  a series card layers onto one dashcard's visualization without occupying a layout slot (slow counts
  series because they run queries on render - a different semantic)."
  []
  (u/index-by :dashboard_id :cnt
              (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
                         :from     [:report_dashboardcard]
                         :group-by [:dashboard_id]})))

(defn eligible-collections
  "Collection subjects (and the recursion substrate): non-archived, default-namespace only
  (snippet/analytics-namespace collections are internal), never the Trash collection (that's
  `trash-not-emptied`'s subject) and never instance-analytics collections. Personal collections ARE
  included (the scan is permission-agnostic; serve-time filters handle exclusion)."
  []
  (t2/select [:model/Collection :id :location]
             {:where [:and
                      [:= :archived false]
                      [:= :namespace nil]
                      [:or
                       [:= :type nil]
                       [:not-in :type [collection/trash-collection-type
                                       collection/instance-analytics-collection-type]]]]}))

(defn direct-item-counts
  "`{collection-id -> raw direct item count}` over `collections`: child collections plus the
  card/dashboard/document items. Empty items still count - only the `empty` cascade looks deeper."
  [collections]
  (merge-with +
              (frequencies (keep (comp collection/location-path->parent-id :location) collections))
              (frequencies (keep :collection_id
                                 (concat (collection-item-cards) (active-dashboards) (document-items))))))
