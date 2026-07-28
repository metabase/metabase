(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.empty
  "The `empty` imbalanced checker: content with nothing in it, across collections, cards, dashboards,
  documents, and transforms. Runs independently of `sparse`/`crowded`, so an entity can be flagged by
  more than one (a collection whose items are all empty is both `empty` and `crowded`).

  What counts as empty:
  - Collection: no non-empty items, checked recursively - a collection holding only empty dashboards is
    empty too.
  - Card: its latest clean run (no parameters, sandbox, cache, or error) returned 0 rows; a card never
    run cleanly is left alone. `as_of` is that run's start.
  - Dashboard: no dashcards.
  - Document: no text and no embedded content.
  - Transform: the target table synced with a row-count estimate of 0 and is still active. `as_of` is
    that sync's time. No live counting against the warehouse.

  Every finding records a count of 0 (there is no threshold - 0 is definitionally empty). Set-based,
  reads only the app DB."
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
  "`{card-id -> started_at}` for every non-archived card whose latest clean run returned 0 rows. Clean
  means unparameterized, unsandboxed, not a cache hit, and error-free - anything else is not
  instance-wide evidence of emptiness (a sandbox filters rows per user, and an errored run means broken,
  not empty). One windowed query picks each card's most recent run, then keeps it only if its row count
  was 0. `parameterized` is matched strictly against `false`, so legacy rows predating these columns
  (NULL) fall out; a NULL `is_sandboxed` is treated as not sandboxed."
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
  "Prose-mirror node types that are pure structure or layout - a document built only from these, with no
  non-blank text or reference label, has no content. `text` is here because a text node's substance is
  its `:text`, checked separately. The list is intentionally not exhaustive: an unknown node type (e.g.
  an image) counts as content, so the check never wrongly calls a document empty."
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
  "Leaf transform `empty` findings: the target table's synced row-count estimate is 0 and the table is
  still active. A transform that hasn't run has no target table and a nil estimate, so it is skipped.
  `as_of` is the table row's `updated_at`, a proxy for sync freshness."
  []
  (for [{:keys [id as_of]} (t2/query {:select [:t.id [:mt.updated_at :as_of]]
                                      :from   [[:transform :t]]
                                      :join   [[:metabase_table :mt] [:= :mt.id :t.target_table_id]]
                                      :where  [:and
                                               [:= :mt.estimated_row_count 0]
                                               [:= :mt.active true]]})]
    (shared/finding :transform id :empty 0 {:threshold 0 :unit "rows" :as_of as_of})))

(defn- non-empty-collection-ids
  "Cascade the leaf emptiness verdicts up the tree: a collection is non-empty if any collection in its
  subtree (itself included) directly holds a non-empty item. Marks each leaf-holding collection and its
  ancestors (from `location`); a leaf in an ineligible collection (e.g. audit content) is dropped, so it
  can't mark ancestors."
  [collections leaf-coll-ids]
  (let [id->location (u/index-by :id :location collections)]
    (into #{}
          (mapcat (fn [id]
                    (when-let [location (get id->location id)]
                      (cons id (collection/location-path->ids location)))))
          leaf-coll-ids)))

(defn checker
  "Instance-wide `empty` findings across collections, cards, dashboards, documents, and transforms. The
  leaf verdicts (the card probe, empty dashboards, empty documents) feed the collection cascade computed
  in the same pass."
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
