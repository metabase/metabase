(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.common
  "Shared helpers for the three imbalanced checkers (`empty`/`sparse`/`crowded`, one per sibling
  namespace): the finding constructor and the app-db count/row helpers more than one of them needs -
  notably `eligible-collections`, the checkers' view over the module-wide collection-subject definition
  (`common/eligible-collection-where`), so the checkers never scan different collection sets. Each
  checker re-runs only the helpers it needs; these are cheap app-db aggregates, so we favor independence
  over threading shared results.

  A collection's direct items are exactly its non-archived child collections plus its cards, dashboards,
  documents, and transforms (a card inside a dashboard or document lives in that container, not the
  collection). Checker-specific probes - the card-run window, document parsing, per-tab dashcard
  grouping - live in the checker namespaces."
  (:require
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.db :as cd.db]
   [metabase.collections.models.collection :as collection]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn finding
  "The shared imbalanced finding shape: the measured amount in `:content-count`, the crossed limit and
  its unit in `:details`."
  [entity-type entity-id finding-type content-count details]
  {:entity-type   entity-type
   :entity-id     entity-id
   :finding-type  finding-type
   :content-count content-count
   :details       details})

(defn collection-item-cards
  "Non-archived cards in eligible containers that count as direct collection items, as
  `{:id :collection_id}` rows - dashboard/document-internal cards live inside their container, not the
  collection."
  []
  (cd.db/collection-item-card-rows (common/eligible-container-clause :collection_id)))

(defn active-dashboards
  "Non-archived dashboards in eligible containers as `{:id :collection_id}` rows."
  []
  (cd.db/active-dashboard-rows (common/eligible-container-clause :collection_id)))

(defn document-items
  "Non-archived documents in eligible containers as `{:id :collection_id}` rows - the light form for
  collection counting (no AST fetch)."
  []
  (cd.db/document-rows (common/eligible-container-clause :collection_id)))

(defn active-documents
  "Non-archived documents in eligible containers with their AST - for the document verdicts, which parse
  `:document`."
  []
  (cd.db/active-document-rows (common/eligible-container-clause :collection_id)))

(defn transform-items
  "Transforms as `{:id :collection_id}` rows - transforms are hard-deleted (no archived column), so every
  row counts."
  []
  ;; no container clause: a transform's only possible containers are transforms-namespace collections
  ;; (`allowed-namespaces :model/Transform`), and both consumers ignore ineligible collections' counts
  (cd.db/transform-rows))

(defn dashboard-dashcard-totals
  "`{dashboard-id -> primary dashcard count across all tabs}`; no row = 0. Counts primary dashcards
  only - a series card layers onto another dashcard without taking a layout slot of its own."
  []
  (u/index-by :dashboard_id :cnt (cd.db/dashboard-dashcard-counts)))

(defn eligible-collections
  "The collections the imbalanced checkers scan: the shared collection-subject set
  (`common/eligible-collection-where`)."
  []
  (cd.db/collection-locations common/eligible-collection-where))

(defn direct-item-counts
  "`{collection-id -> raw direct item count}` over `collections`: child collections plus the
  card/dashboard/document/transform items. Empty items still count; all three checkers read this
  same count."
  [collections]
  (merge-with +
              (frequencies (keep (comp collection/location-path->parent-id :location) collections))
              (frequencies (keep :collection_id
                                 (concat (collection-item-cards) (active-dashboards) (document-items)
                                         (transform-items))))))
