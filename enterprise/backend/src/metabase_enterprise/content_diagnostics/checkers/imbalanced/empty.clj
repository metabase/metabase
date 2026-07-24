(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.empty
  "The `empty` imbalanced checker - content with nothing in it, across collection, card, dashboard,
  document, and transform. Independent of `sparse`/`crowded`: an entity flagged here can also be
  flagged by them (a collection whose many items are all empty is both `crowded` and `empty`).

  - **Collection:** 0 non-empty items *recursively* - a cascade over this same pass's leaf verdicts,
    so a collection holding only empty dashboards IS empty. An item counts as a non-empty leaf unless
    this pass flagged it empty (a card with no run signal counts as non-empty).
  - **Card:** the latest clean (unparameterized, unsandboxed, non-cache-hit, error-free) execution
    returned 0 rows; never run cleanly -> skipped (unknown, not empty), and a newer run outside the
    evidence set neither flags nor clears. `as_of` = the deciding run's start.
  - **Dashboard:** 0 dashcards (a tabless dashboard and an all-empty-tabs dashboard both qualify).
  - **Document:** no content of any kind - fail closed, an unknown node type counts as content.
  - **Transform:** the target table's synced `estimated_row_count` is literally 0 and the table is
    still active (a dropped target is inactive; nil estimate = unknown -> skipped). `as_of` = the
    table row's `updated_at` (sync-freshness proxy). No live warehouse counting.

  Every finding stamps `content-count` 0 and freezes `{:threshold 0, :unit}` (+ `as_of` on the two
  evidence-dated empties). `empty` reads no thresholds (0 is definitional). Set-based, app-db only; the
  denormalized display attrs are stamped by `common/attach-entity-attrs`."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
    (shared/finding :transform id :empty 0 {:threshold 0 :unit "rows" :as_of as_of})))

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

(defn checker
  "Instance-wide `empty` finding maps across collection, card, dashboard, document, and transform. The
  leaf verdicts (the card probe, 0-dashcard dashboards, no-content documents) feed the collection
  cascade computed in the same pass."
  []
  (let [empty-card-as-of (empty-card-id->as-of)
        cards            (shared/collection-item-cards)
        dashboards       (shared/active-dashboards)
        dashcard-totals  (shared/dashboard-dashcard-totals)
        documents        (shared/active-documents)
        collections      (shared/eligible-collections)
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
        (shared/finding :collection id :empty 0 {:threshold 0 :unit "items"}))
      (for [[card-id as-of] empty-card-as-of]
        (shared/finding :card card-id :empty 0 {:threshold 0 :unit "rows" :as_of as-of}))
      (for [id empty-dashboards]
        (shared/finding :dashboard id :empty 0 {:threshold 0 :unit "dashcards"}))
      (for [id empty-documents]
        (shared/finding :document id :empty 0 {:threshold 0 :unit "cards"}))
      (transform-findings)))))
