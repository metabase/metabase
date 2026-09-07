(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.empty
  "The `empty` imbalanced checker: content with nothing in it, across collections, cards, dashboards, and
  documents. Runs independently of `sparse`/`crowded`, so an entity can be flagged by more than one (a
  many-tab dashboard with 0 dashcards is both `crowded` and `empty`).

  What counts as empty:
  - Collection: no direct items, the same count `sparse`/`crowded` use. Items are exactly the covered
    kinds: child collections, cards, dashboards, documents, transforms; empty items still count (a
    folder of only-empty dashboards is not `empty` - the dashboards are).
  - Card: its latest clean run (no parameters, sandbox, cache, or error) returned 0 rows; a card never
    run cleanly is left alone. `as_of` is that run's start.
  - Dashboard: no dashcards.
  - Document: no text and no embedded content.

  Transforms are never flagged - the app DB has no reliable row count for a transform's target table.

  Every finding records a count of 0 (there is no threshold - 0 is definitionally empty). Set-based,
  reads only the app DB."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.content-diagnostics.checkers.imbalanced.common :as shared]
   [metabase-enterprise.content-diagnostics.common :as common]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- empty-card-id->as-of
  "`{card-id -> started_at}` for every non-archived card in an eligible container whose latest clean run
  returned 0 rows. Clean means unparameterized, unsandboxed, not a cache hit, and error-free - anything
  else is not instance-wide evidence of emptiness (a sandbox filters rows per user, and an errored run
  means broken, not empty). One windowed query picks each card's most recent run, then keeps it only if
  its row count was 0. `parameterized` is matched strictly against `false`, so legacy rows predating
  these columns (NULL) fall out; a NULL `is_sandboxed` is treated as not sandboxed."
  []
  (u/index-by :card_id :started_at
              (t2/query {:select [:card_id :started_at]
                         :from   [[^:allow-subquery
                                   {:select [:qe.card_id :qe.started_at :qe.result_rows
                                             [[:over [[:row_number] ^:allow-subquery
                                                      {:partition-by :qe.card_id
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
                                             [:= :qe.error nil]
                                             (common/eligible-container-clause :c.collection_id)]}
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

(defn checker
  "Instance-wide `empty` findings across collections, cards, dashboards, and documents. Collections are
  flagged on their direct-item count alone - the per-item verdicts never roll up."
  []
  (let [empty-card-as-of (empty-card-id->as-of)
        dashboards       (shared/active-dashboards)
        dashcard-totals  (shared/dashboard-dashcard-totals)
        documents        (shared/active-documents)
        collections      (shared/eligible-collections)
        item-counts      (shared/direct-item-counts collections)
        empty-dashboards (into #{}
                               (keep #(when (zero? (long (get dashcard-totals (:id %) 0))) (:id %)))
                               dashboards)
        ;; only a parseable (prose-mirror) document can be judged empty - any other content type is
        ;; unknown, so it is never flagged
        empty-documents  (into #{}
                               (keep #(when (and (= (:content_type %) prose-mirror/prose-mirror-content-type)
                                                 (document-empty? %))
                                        (:id %)))
                               documents)]
    (common/attach-entity-attrs
     (concat
      (for [{:keys [id]} collections
            :when (zero? (long (get item-counts id 0)))]
        (shared/finding :collection id :empty 0 {:threshold 0 :unit "items"}))
      (for [[card-id as-of] empty-card-as-of]
        (shared/finding :card card-id :empty 0 {:threshold 0 :unit "rows" :as_of as-of}))
      (for [id empty-dashboards]
        (shared/finding :dashboard id :empty 0 {:threshold 0 :unit "dashcards"}))
      (for [id empty-documents]
        (shared/finding :document id :empty 0 {:threshold 0 :unit "cards"}))))))
