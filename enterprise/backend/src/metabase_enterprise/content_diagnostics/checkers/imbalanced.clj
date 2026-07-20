(ns metabase-enterprise.content-diagnostics.checkers.imbalanced
  "The imbalanced family of Content Diagnostics checkers - `empty`, `sparse`, and `crowded` as three
  **independent** checkers (each its own registry entry, supersession scope, and threshold reads);
  counting always excludes archived rows. There is no cross-type precedence: each checker applies its
  own rule knowing nothing of the other two, so one entity can legitimately carry several of these
  finding types at once (a collection of 150 empty dashboards is `crowded` AND `empty`; a 6-tab
  dashboard holding 2 dashcards is `crowded` AND `sparse`).

  - **`empty`** - no content at all. Collection = 0 non-empty items *recursively* (a cascade over this
    same pass's leaf verdicts: a collection holding only empty dashboards IS empty). Dashboard =
    0 dashcards. Document = no content of any kind (fail closed - an unknown node type counts as
    content). Card = the latest clean (unparameterized, unsandboxed, non-cache-hit, error-free)
    execution returned 0 rows; never run cleanly -> skipped (unknown, not empty), and a newer run
    outside the evidence set neither flags nor clears; `as_of` = the deciding run's start. Transform =
    the target table's synced `estimated_row_count` is literally 0 and the table is still active (a
    dropped target is inactive; nil estimate = unknown -> skipped); `as_of` = the table row's
    `updated_at` (sync-freshness proxy). No live warehouse counting.
  - **`sparse`** - a little content, not none: the rule floors at 1, so a zero-count subject is the
    `empty` checker's alone. Collection = 0 < raw direct item count < bound (empty items still
    count). Dashboard = 0 < dashcards **total** across tabs < bound.
  - **`crowded`** - too much content. Collection = raw direct item count > bound. Dashboard = too
    many dashcards on one tab, or - only if that passes - too many tabs (within-type precedence: at
    most one `crowded` finding per entity). Document = too many embedded cards.

  Collection direct items = non-archived child collections + cards/dashboards/documents
  (collection-items semantics: dashboard/document-internal cards live inside their container, not the
  collection). Personal collections are scanned (the scan is permission-agnostic; serve-time filters
  handle exclusion). A tabless dashboard counts as one implicit tab.

  Every finding stamps its measured magnitude in the top-level `:content-count` (0 on every `empty`)
  and freezes `{threshold, unit}` (+ `as_of` on the two evidence-dated empties) in `details` at scan
  time. Every detector is **set-based** (a fixed handful of grouped queries plus app-side merges over
  id-sized rows; no per-entity loop) and reads only the app-db; the checkers share substrate *helpers*
  but run their queries independently. The denormalized display attrs are stamped by
  `common/attach-entity-attrs`; `:duration-ms`/`:last-active-at` are left unset."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- finding
  "The shared imbalanced finding shape: measured magnitude in the top-level `:content-count`, the
  crossed bound + its unit frozen in `details`."
  [entity-type entity-id finding-type content-count details]
  {:entity-type   entity-type
   :entity-id     entity-id
   :finding-type  finding-type
   :content-count content-count
   :details       details})

;;; ------------------------------------------------ substrate ------------------------------------------------
;;; Shared query helpers. Each checker calls only what it needs and runs its own queries - independence
;;; over result reuse (these are cheap app-db aggregates).

(defn- collection-item-cards
  "Non-archived cards that count as direct collection items, as `{:id :collection_id}` rows -
  dashboard/document-internal cards live inside their container, not the collection."
  []
  (t2/query {:select [:id :collection_id]
             :from   [:report_card]
             :where  [:and
                      [:= :archived false]
                      [:= :dashboard_id nil]
                      [:= :document_id nil]]}))

(defn- active-dashboards
  "Non-archived dashboards as `{:id :collection_id}` rows."
  []
  (t2/query {:select [:id :collection_id]
             :from   [:report_dashboard]
             :where  [:= :archived false]}))

(defn- document-items
  "Non-archived documents as `{:id :collection_id}` rows - the light form for collection counting
  (no AST fetch)."
  []
  (t2/query {:select [:id :collection_id]
             :from   [(t2/table-name :model/Document)]
             :where  [:= :archived false]}))

(defn- active-documents
  "Non-archived documents with their AST - for the document verdicts, which parse `:document`."
  []
  (t2/select [:model/Document :id :collection_id :document :content_type] :archived false))

(defn- dashboard-dashcard-totals
  "`{dashboard-id -> primary dashcard count across all tabs}`; no row = 0. Primary dashcards only:
  a series card layers onto one dashcard's visualization without occupying a layout slot (slow counts
  series because they run queries on render - a different semantic)."
  []
  (u/index-by :dashboard_id :cnt
              (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
                         :from     [:report_dashboardcard]
                         :group-by [:dashboard_id]})))

(defn- eligible-collections
  "Collection subjects (and the recursion substrate): non-archived, default-namespace only
  (snippet/analytics-namespace collections are internal), never the Trash collection (that's
  `trash-not-emptied`'s subject) and never instance-analytics collections. Personal collections ARE
  included."
  []
  (t2/select [:model/Collection :id :location]
             {:where [:and
                      [:= :archived false]
                      [:= :namespace nil]
                      [:or
                       [:= :type nil]
                       [:not-in :type [collection/trash-collection-type
                                       collection/instance-analytics-collection-type]]]]}))

(defn- direct-item-counts
  "`{collection-id -> raw direct item count}` over `collections`: child collections plus the
  card/dashboard/document items. Empty items still count - only the `empty` cascade looks deeper."
  [collections]
  (merge-with +
              (frequencies (keep (comp collection/location-path->parent-id :location) collections))
              (frequencies (keep :collection_id
                                 (concat (collection-item-cards) (active-dashboards) (document-items))))))

;;; ------------------------------------------- emptiness evidence --------------------------------------------

(defn- empty-card-id->as-of
  "`{card-id -> started_at of the deciding run}` for every **non-archived** card whose latest clean
  (unparameterized, unsandboxed, non-cache-hit, error-free) execution returned 0 rows. One windowed query
  (executions are not serialized, so a grouped MAX can't pick the latest row). `parameterized = false`
  strictly: a NULL (pre-column legacy row) is unknown, and unknown runs are outside the evidence set - as
  are errored runs, whose rows also stamp `result_rows` 0 (a crashed run means \"broken\", not \"empty\"),
  and sandboxed runs (the sandbox filters rows per-user, so their 0 rows is not instance-wide evidence).
  `is_sandboxed` is nullable with no default; NULL counts as not sandboxed - the strict `parameterized`
  check already fences the legacy rows that predate both columns."
  []
  (u/index-by :card_id :started_at
              (t2/query {:select [:card_id :started_at]
                         :from   [[{:select [:qe.card_id :qe.started_at :qe.result_rows
                                             [[:over [[:row_number] {:partition-by :qe.card_id
                                                                     :order-by     [[:qe.started_at :desc]
                                                                                    [:qe.id :desc]]}]]
                                              :rn]]
                                    :from   [[:query_execution :qe]]
                                    :join   [[:report_card :c] [:= :c.id :qe.card_id]]
                                    :where  [:and
                                             [:= :c.archived false]
                                             [:= :qe.parameterized false]
                                             [:= [:coalesce :qe.is_sandboxed false] false]
                                             [:not= :qe.cache_hit true]
                                             [:= :qe.error nil]]}
                                   :ranked]]
                         :where  [:and [:= :rn 1] [:= :result_rows 0]]})))

(def ^:private structural-node-types
  "Prose-mirror node types that are pure structure/layout - a document made only of these (with no
  non-blank text or reference label) has no content. `text` is here because a text node's substance is
  its `:text`, checked separately. Deliberately NOT exhaustive over future editor nodes: an unknown
  type (e.g. an image) counts as content, so the emptiness predicate fails closed."
  #{"doc" "paragraph" "heading" "text" "bulletList" "orderedList" "listItem" "blockquote"
    "codeBlock" "flexContainer" "resizeNode" "hardBreak"})

(defn- document-empty?
  "True when a prose-mirror document has **no content of any kind**: no non-blank text, no non-blank
  reference label (smart links, mentions), and no node outside [[structural-node-types]] (card embeds
  and unknown future node types count as content)."
  [doc]
  (empty? (prose-mirror/collect-ast
           doc
           (fn [{:keys [type text] :as node}]
             (when (or (not (str/blank? text))
                       (not (str/blank? (get-in node [:attrs :label])))
                       (and (some? type) (not (structural-node-types type))))
               node)))))

(defn- transform-findings
  "Leaf transform `empty` findings: the target table's synced row-count estimate is literally 0 and the
  table is still active. A never-run/synced transform has no `target_table_id` and a nil estimate is
  unknown - both naturally skipped. `as_of` = the table row's `updated_at` (sync-freshness proxy)."
  []
  (for [{:keys [id as_of]} (t2/query {:select [:t.id [:mt.updated_at :as_of]]
                                      :from   [[:transform :t]]
                                      :join   [[:metabase_table :mt] [:= :mt.id :t.target_table_id]]
                                      :where  [:and
                                               [:= :mt.estimated_row_count 0]
                                               [:= :mt.active true]]})]
    (finding :transform id :empty 0 {:threshold 0 :unit "rows" :as_of as_of})))

(defn- non-empty-collection-ids
  "Cascade the leaf emptiness verdicts up the tree: a collection is non-empty iff some collection in
  its subtree (self included) directly holds a non-empty leaf item. Marks each leaf-holding collection
  and all its ancestors (parsed from `location`); the guard drops leaves whose collection is outside
  the eligible set (e.g. audit content), so they can't mark ancestors."
  [collections leaf-coll-ids]
  (let [id->location (u/index-by :id :location collections)]
    (into #{}
          (mapcat (fn [id]
                    (when-let [location (get id->location id)]
                      (cons id (collection/location-path->ids location)))))
          leaf-coll-ids)))

;;; ------------------------------------------------- checkers ------------------------------------------------

(defn empty-checker
  "Instance-wide `empty` finding maps across collection, card, dashboard, document, and transform.
  The leaf verdicts (the card probe, 0-dashcard dashboards, no-content documents) feed the collection
  cascade computed in the same pass."
  []
  (let [empty-card-as-of (empty-card-id->as-of)
        cards            (collection-item-cards)
        dashboards       (active-dashboards)
        dashcard-totals  (dashboard-dashcard-totals)
        documents        (active-documents)
        collections      (eligible-collections)
        empty-cards      (set (keys empty-card-as-of))
        empty-dashboards (into #{}
                               (keep #(when (zero? (long (get dashcard-totals (:id %) 0))) (:id %)))
                               dashboards)
        ;; only a parseable (prose-mirror) document can be judged empty - any other content type is
        ;; unknown, so it counts as a non-empty leaf below
        empty-documents  (into #{}
                               (keep #(when (and (= (:content_type %) prose-mirror/prose-mirror-content-type)
                                                 (document-empty? %))
                                        (:id %)))
                               documents)
        ;; an item counts as a non-empty leaf unless this same pass flagged it empty (a card with no
        ;; run signal counts as non-empty)
        leaf-coll-ids    (into #{}
                               (concat
                                (keep #(when-not (empty-cards (:id %)) (:collection_id %)) cards)
                                (keep #(when-not (empty-dashboards (:id %)) (:collection_id %)) dashboards)
                                (keep #(when-not (empty-documents (:id %)) (:collection_id %)) documents)))
        non-empty-colls  (non-empty-collection-ids collections leaf-coll-ids)]
    (common/attach-entity-attrs
     (concat
      (for [{:keys [id]} collections
            :when (not (contains? non-empty-colls id))]
        (finding :collection id :empty 0 {:threshold 0 :unit "items"}))
      (for [[card-id as-of] empty-card-as-of]
        (finding :card card-id :empty 0 {:threshold 0 :unit "rows" :as_of as-of}))
      (for [id empty-dashboards]
        (finding :dashboard id :empty 0 {:threshold 0 :unit "dashcards"}))
      (for [id empty-documents]
        (finding :document id :empty 0 {:threshold 0 :unit "cards"}))
      (transform-findings)))))

(defn sparse-checker
  "Instance-wide `sparse` finding maps across collection and dashboard. Sparse means a little
  content, not none: the rule floors at 1, so a zero-count subject is the `empty` checker's alone."
  []
  (let [sparse-collection-items    (cd.settings/content-diagnostics-sparse-collection-threshold-items)
        sparse-dashboard-dashcards (cd.settings/content-diagnostics-sparse-dashboard-threshold-dashcards)
        dashcard-totals            (dashboard-dashcard-totals)]
    (common/attach-entity-attrs
     (concat
      (let [collections (eligible-collections)
            counts      (direct-item-counts collections)]
        (for [{:keys [id]} collections
              :let  [n (long (get counts id 0))]
              :when (< 0 n sparse-collection-items)]
          (finding :collection id :sparse n {:threshold sparse-collection-items :unit "items"})))
      (for [{:keys [id]} (active-dashboards)
            :let  [total (long (get dashcard-totals id 0))]
            :when (< 0 total sparse-dashboard-dashcards)]
        (finding :dashboard id :sparse total
                 {:threshold sparse-dashboard-dashcards :unit "dashcards"}))))))

(defn crowded-checker
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
      (let [collections (eligible-collections)
            counts      (direct-item-counts collections)]
        (for [{:keys [id]} collections
              :let  [n (long (get counts id 0))]
              :when (> n crowded-collection-items)]
          (finding :collection id :crowded n {:threshold crowded-collection-items :unit "items"})))
      (for [{:keys [id]} (active-dashboards)
            :let  [tab-rows    (get dashcard-groups id)
                   max-per-tab (transduce (map :cnt) max 0 tab-rows)
                   tabs        (max 1 (long (get tab-counts id 0)))
                   verdict     (cond
                                 (> max-per-tab crowded-dashcards-per-tab)
                                 (finding :dashboard id :crowded max-per-tab
                                          {:threshold crowded-dashcards-per-tab :unit "dashcards"})

                                 (> tabs crowded-tabs)
                                 (finding :dashboard id :crowded tabs
                                          {:threshold crowded-tabs :unit "tabs"}))]
            :when verdict]
        verdict)
      (for [doc   (active-documents)
            :when (= (:content_type doc) prose-mirror/prose-mirror-content-type)
            :let  [n (count (prose-mirror/card-ids doc))]
            :when (> n crowded-document-cards)]
        (finding :document (:id doc) :crowded n {:threshold crowded-document-cards :unit "cards"}))))))
