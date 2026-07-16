(ns metabase-enterprise.content-diagnostics.checkers.imbalanced
  "The imbalanced Content Diagnostics checker - one count pass over the app-db powering three finding
  types (`empty`/`sparse`/`crowded`); counting always excludes archived rows:

  - **Collection:** `empty` = 0 non-empty items *recursively* (cascade: an item counts only if this
    same scan didn't flag it empty, so a collection holding only empty dashboards IS empty);
    `crowded`/`sparse` use the **raw** direct item count (empty items still count). Items = direct
    non-archived child collections + cards/dashboards/documents (collection-items semantics:
    dashboard/document-internal cards don't count). Personal collections are scanned (the scan is
    permission-agnostic; serve-time filters handle exclusion).
  - **Dashboard:** `empty` = 0 dashcards; `crowded` = too many dashcards on one tab, or - only if that
    passes - too many tabs (deterministic precedence, one finding per entity); `sparse` = non-empty
    with too few dashcards **total** across tabs. A tabless dashboard counts as one implicit tab.
  - **Document:** `empty` = no content of any kind (fail closed - an unknown node type counts as
    content); `crowded` = too many embedded cards.
  - **Card** (`empty` only): the latest clean (unparameterized, unsandboxed, non-cache-hit, error-free)
    execution returned 0 rows. Never run cleanly -> skipped (unknown, not empty); a newer parameterized,
    sandboxed, cache-hit, or errored run is outside the evidence set - it neither flags nor clears.
    `as_of` = the deciding run's start.
  - **Transform** (`empty` only): the target table's synced `estimated_row_count` is literally 0 and
    the table is still active (a dropped target is inactive; nil estimate = unknown -> skipped).
    `as_of` = the table row's `updated_at` (sync-freshness proxy). No live warehouse counting.

  `empty` and `sparse` are mutually exclusive by construction (sparse requires non-empty); precedence
  (empty, then crowded, then sparse) guarantees at most one imbalanced finding per entity per scan.
  Every finding stamps its measured magnitude in the top-level `:content-count` (0 on every `empty`)
  and freezes `{threshold, unit}` (+ `as_of` on the two evidence-dated empties) in `details` at scan
  time; thresholds are read once at checker start. Every detector is **set-based** (a fixed handful of
  grouped queries plus app-side merges over id-sized rows; no per-entity loop) and reads only the
  app-db. The denormalized display attrs are stamped by `common/attach-entity-attrs`;
  `:duration-ms`/`:last-active-at` are left unset."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
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

(defn- empty-ids
  "Ids of one entity-type's `empty` findings - the emptiness verdicts the collection cascade consumes."
  [findings entity-type]
  (into #{}
        (comp (filter #(and (= entity-type (:entity-type %)) (= :empty (:finding-type %))))
              (map :entity-id))
        findings))

;;; -------------------------------------------------- cards --------------------------------------------------

(defn- empty-card-id->as-of
  "`{card-id -> started_at of the deciding run}` for every **non-archived** card whose latest clean
  (unparameterized, unsandboxed, non-cache-hit, error-free) execution returned 0 rows. One windowed query
  (executions are not serialized, so a grouped MAX can't pick the latest row). `parameterized = false`
  strictly: a NULL (pre-column legacy row) is unknown, and unknown runs are outside the evidence set - as
  are errored runs, whose rows also stamp `result_rows` 0 (a crashed run means \"broken\", not \"empty\"),
  and sandboxed runs (the sandbox filters rows per-user, so their 0 rows is not instance-wide evidence)."
  []
  (into {}
        (map (juxt :card_id :started_at))
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
                                       [:not= :qe.is_sandboxed true]
                                       [:not= :qe.cache_hit true]
                                       [:= :qe.error nil]]}
                             :ranked]]
                   :where  [:and [:= :rn 1] [:= :result_rows 0]]})))

(defn- card-findings
  "Leaf card `empty` findings, `as_of` frozen to the deciding run's start."
  [empty-card-as-of]
  (for [[card-id as-of] empty-card-as-of]
    (finding :card card-id :empty 0 {:threshold 0 :unit "rows" :as_of as-of})))

;;; ------------------------------------------------ dashboards -----------------------------------------------

(defn- dashboard-findings
  "One verdict per **non-archived** dashboard: empty (0 dashcards), else crowded (dashcards on one tab
  first, then tab count - deterministic precedence), else sparse (dashcards **total** across tabs).
  `dashcard-groups` is `{dashboard-id -> [{:dashboard_tab_id :cnt} ...]}`; `tab-counts`
  `{dashboard-id -> tab-count}` (no row = tabless = one implicit tab)."
  [dashboards dashcard-groups tab-counts
   {:keys [crowded-dashcards-per-tab crowded-tabs sparse-dashboard-dashcards]}]
  (for [{:keys [id]} dashboards
        :let [tab-rows    (get dashcard-groups id)
              total       (transduce (map :cnt) + 0 tab-rows)
              max-per-tab (transduce (map :cnt) max 0 tab-rows)
              tabs        (max 1 (long (get tab-counts id 0)))
              f           (cond
                            (zero? total)
                            (finding :dashboard id :empty 0 {:threshold 0 :unit "dashcards"})

                            (> max-per-tab crowded-dashcards-per-tab)
                            (finding :dashboard id :crowded max-per-tab
                                     {:threshold crowded-dashcards-per-tab :unit "dashcards"})

                            (> tabs crowded-tabs)
                            (finding :dashboard id :crowded tabs {:threshold crowded-tabs :unit "tabs"})

                            (< total sparse-dashboard-dashcards)
                            (finding :dashboard id :sparse total
                                     {:threshold sparse-dashboard-dashcards :unit "dashcards"}))]
        :when f]
    f))

;;; ------------------------------------------------ documents ------------------------------------------------

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

(defn- document-findings
  "One verdict per **non-archived** prose-mirror document: empty (no content), else crowded (embedded
  card count). A document with any other content type can't be parsed - unknown, so neither."
  [documents {:keys [crowded-document-cards]}]
  (for [doc   documents
        :when (= (:content_type doc) prose-mirror/prose-mirror-content-type)
        :let  [f (if (document-empty? doc)
                   (finding :document (:id doc) :empty 0 {:threshold 0 :unit "cards"})
                   (let [n (count (prose-mirror/card-ids doc))]
                     (when (> n crowded-document-cards)
                       (finding :document (:id doc) :crowded n
                                {:threshold crowded-document-cards :unit "cards"}))))]
        :when f]
    f))

;;; ------------------------------------------------ transforms -----------------------------------------------

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

;;; ------------------------------------------------ collections ----------------------------------------------

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

(defn- non-empty-collection-ids
  "Cascade the leaf emptiness verdicts up the tree: a collection is non-empty iff some collection in
  its subtree (self included) directly holds a non-empty leaf item. Marks each leaf-holding collection
  and all its ancestors (parsed from `location`); the guard drops leaves whose collection is outside
  the eligible set (e.g. audit content), so they can't mark ancestors."
  [collections leaf-coll-ids]
  (let [id->location (into {} (map (juxt :id :location)) collections)]
    (into #{}
          (mapcat (fn [id]
                    (when-let [location (get id->location id)]
                      (cons id (collection/location-path->ids location)))))
          leaf-coll-ids)))

(defn- collection-findings
  "One verdict per eligible collection: empty (per the recursive cascade - `content-count` is 0 by
  definition, whatever the raw count of empty items), else crowded/sparse on the **raw** direct item
  count (empty items still count)."
  [collections direct-counts non-empty-colls {:keys [crowded-collection-items sparse-collection-items]}]
  (for [{:keys [id]} collections
        :let [n (long (get direct-counts id 0))
              f (cond
                  (not (contains? non-empty-colls id))
                  (finding :collection id :empty 0 {:threshold 0 :unit "items"})

                  (> n crowded-collection-items)
                  (finding :collection id :crowded n {:threshold crowded-collection-items :unit "items"})

                  (< n sparse-collection-items)
                  (finding :collection id :sparse n {:threshold sparse-collection-items :unit "items"}))]
        :when f]
    f))

;;; ------------------------------------------------- checker -------------------------------------------------

(defn checker
  "Instance-wide `empty`/`sparse`/`crowded` finding maps across collection, card, dashboard, document,
  and transform. Thresholds are read once here and frozen into each finding's `details`; the dashboard/
  document emptiness verdicts (and the card-empty probe) feed the collection cascade. The denormalized
  display attrs are stamped by `common/attach-entity-attrs`."
  []
  (let [thresholds       {:crowded-collection-items   (cd.settings/content-diagnostics-crowded-collection-threshold-items)
                          :crowded-dashcards-per-tab  (cd.settings/content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab)
                          :crowded-tabs               (cd.settings/content-diagnostics-crowded-dashboard-threshold-tabs)
                          :crowded-document-cards     (cd.settings/content-diagnostics-crowded-document-threshold-cards)
                          :sparse-collection-items    (cd.settings/content-diagnostics-sparse-collection-threshold-items)
                          :sparse-dashboard-dashcards (cd.settings/content-diagnostics-sparse-dashboard-threshold-dashcards)}
        empty-card-as-of (empty-card-id->as-of)
        ;; collection "items" - direct non-archived children of the 4 leaf kinds + child collections
        ;; (collection-items semantics: dashboard/document-internal cards live inside their container,
        ;; not the collection)
        cards            (t2/query {:select [:id :collection_id]
                                    :from   [:report_card]
                                    :where  [:and
                                             [:= :archived false]
                                             [:= :dashboard_id nil]
                                             [:= :document_id nil]]})
        dashboards       (t2/query {:select [:id :collection_id]
                                    :from   [:report_dashboard]
                                    :where  [:= :archived false]})
        ;; primary dashcards only: crowding measures layout slots, and a series card layers onto one
        ;; dashcard's visualization without occupying one (slow counts series because they run queries
        ;; on render - a different semantic)
        dashcard-groups  (group-by :dashboard_id
                                   (t2/query {:select   [:dashboard_id :dashboard_tab_id [[:count :*] :cnt]]
                                              :from     [:report_dashboardcard]
                                              :group-by [:dashboard_id :dashboard_tab_id]}))
        tab-counts       (into {}
                               (map (juxt :dashboard_id :cnt))
                               (t2/query {:select   [:dashboard_id [[:count :*] :cnt]]
                                          :from     [:dashboard_tab]
                                          :group-by [:dashboard_id]}))
        documents        (t2/select [:model/Document :id :collection_id :document :content_type]
                                    :archived false)
        collections      (eligible-collections)
        dashboard-fs     (dashboard-findings dashboards dashcard-groups tab-counts thresholds)
        document-fs      (document-findings documents thresholds)
        ;; leaf emptiness verdicts feed the collection cascade: an item counts as non-empty unless this
        ;; same scan flagged it empty (a card with no run signal counts as non-empty)
        empty-cards      (set (keys empty-card-as-of))
        empty-dashboards (empty-ids dashboard-fs :dashboard)
        empty-documents  (empty-ids document-fs :document)
        leaf-coll-ids    (into #{}
                               (concat
                                (keep #(when-not (empty-cards (:id %)) (:collection_id %)) cards)
                                (keep #(when-not (empty-dashboards (:id %)) (:collection_id %)) dashboards)
                                (keep #(when-not (empty-documents (:id %)) (:collection_id %)) documents)))
        non-empty-colls  (non-empty-collection-ids collections leaf-coll-ids)
        direct-counts    (merge-with +
                                     (frequencies (keep (comp collection/location-path->parent-id :location)
                                                        collections))
                                     (frequencies (keep :collection_id (concat cards dashboards documents))))]
    (common/attach-entity-attrs
     (concat
      (collection-findings collections direct-counts non-empty-colls thresholds)
      (card-findings empty-card-as-of)
      dashboard-fs
      document-fs
      (transform-findings)))))
