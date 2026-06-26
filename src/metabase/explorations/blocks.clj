(ns metabase.explorations.blocks
  "Read-side: build the nested `blocks -> pages` structure the FE renders, from a thread's
   persisted `ExplorationBlock` + `ExplorationPage` rows and its hydrated query rows.

   Each block becomes one sidebar heading; within it, each persisted page becomes a child
   bundling that page's query ids (sorted by interestingness). The block heading (with
   ambiguity disambiguation) and each page's display name are computed here — they're not
   persisted."
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn page-url
  "Relative URL of a page in the exploration detail view. Used by the document-append endpoint
   and the AI summary materializer to deep-link a static `cardEmbed`'s title back to its page."
  [exploration-id page-id]
  (str "/question/research/" exploration-id "/page/" page-id))

;;; ------------------------------------------- names -------------------------------------------

(defn- leaf-name
  "Fallback page display name: prefer the base (unsegmented) query's `:name`, else the first
   query's `:name`."
  [queries]
  (let [base (some #(when (nil? (:segment_id %)) %) queries)]
    (or (:name base) (:name (first queries)))))

(defn- dimension-anchored?
  "Whether `block` is anchored on its dimension (one dimension crossed with several metrics)
   rather than its metric. Reads the FE-supplied `:type`; legacy rows (no `:type`) are inferred
   — a dimension block is the only shape with more than one metric."
  [block]
  (case (:type block)
    "dimension" true
    "metric"    false
    (> (count (:metrics block)) 1)))

(defn- anchor-dimension
  "The dimension a dimension-anchored block is built around (its first/only dimension)."
  [block]
  (first (:dimensions block)))

(defn- dimension-base-name
  [dim]
  (or (:display_name dim) (:dimension_id dim) ""))

(defn- dimension-long-name
  "Disambiguated dimension label `<source> - <name>` when the dim carries a source (`:group`)
   label, else the plain base name."
  [dim]
  (let [base   (dimension-base-name dim)
        source (some-> dim :group :display_name)]
    (if (str/blank? source)
      base
      (tru "{0} - {1}" source base))))

(defn- by-dimension
  "Render a `By <dimension>` label."
  [label]
  (tru "By {0}" label))

(defn block-display-name
  "Sidebar heading for a block: `By <dimension>` for a dimension-anchored block, otherwise the
   metric's name. `card-name-by-id` maps a metric Card id to its name. When `ambiguous?` (the
   base dimension name is shared by another block), the dimension is qualified by its source —
   `By <source> - <dimension>` — so same-named blocks stay identifiable. Public so the LLM
   planner context can label a block the same way the read tree does."
  ([block card-name-by-id]
   (block-display-name block card-name-by-id false))
  ([block card-name-by-id ambiguous?]
   (if (dimension-anchored? block)
     (let [dim (anchor-dimension block)]
       (by-dimension (if ambiguous?
                       (dimension-long-name dim)
                       (dimension-base-name dim))))
     (or (get card-name-by-id (:card_id (first (:metrics block)))) ""))))

(defn- page-name
  "Display name for a page. For a dimension-anchored block the pages vary by metric, so name
   each by its metric (Card) name; for a metric-anchored block they vary by dimension, so name
   each `By <dimension>`."
  [block page queries card-name-by-id]
  (if (dimension-anchored? block)
    (or (get card-name-by-id (:card_id page)) (leaf-name queries))
    (if-let [dn (:dimension_name (first queries))]
      (by-dimension dn)
      (leaf-name queries))))

;;; ------------------------------------------ scoring ------------------------------------------

(defn- effective-score
  "Per-query score for ordering: contextual when present, else heuristic."
  [query]
  (or (:contextual_interestingness_score query)
      (:interestingness_score query)))

(defn- max-score
  "Max [[effective-score]] across `queries`, or `nil` if none scored."
  [queries]
  (let [scores (keep effective-score queries)]
    (when (seq scores) (apply max scores))))

(defn- page-sort-key
  "Sort pages within a block by max interestingness desc, with no-score pages last and `:id` as
   the stable tiebreak."
  [{::keys [max-score] :keys [id]}]
  (if max-score [0 (- max-score) id] [1 0 id]))

;;; -------------------------------------------- tree -------------------------------------------

(defn- page-node
  [block page queries card-name-by-id]
  {:id         (:id page)
   :name       (page-name block page queries card-name-by-id)
   :query_ids  (mapv :id queries)
   ::max-score (max-score queries)})

(defn blocks-tree
  "Given a thread's persisted `ExplorationBlock` rows (authoring order), its `ExplorationPage`
   rows, and its hydrated query rows, return the nested vector the FE renders:

       [{:id       <block-pk>
         :type     \"metric\" | \"dimension\"
         :name     <computed heading>
         :position <0-indexed slot among blocks>
         :pages    [{:id        <page-pk>
                     :name      <computed page name>
                     :position  <0-indexed slot among the block's pages, score-sorted>
                     :query_ids [<id> <id> ...]}]}]

   Pages are sorted by interestingness desc within their block. Pages whose block isn't in
   `blocks` are dropped; queries are matched to their page via `page_id`."
  [blocks pages card-name-by-id queries]
  (let [base-name-counts (->> blocks
                              (filter dimension-anchored?)
                              (map #(dimension-base-name (anchor-dimension %)))
                              frequencies)
        ambiguous?       (fn [block]
                           (and (dimension-anchored? block)
                                (> (get base-name-counts
                                        (dimension-base-name (anchor-dimension block)) 0)
                                   1)))
        queries-by-page  (group-by :page_id queries)
        pages-by-block   (group-by :exploration_block_id pages)]
    (into []
          (map-indexed
           (fn [block-pos block]
             (let [block-pages (->> (get pages-by-block (:id block) [])
                                    (map (fn [page]
                                           (page-node block page
                                                      (get queries-by-page (:id page) [])
                                                      card-name-by-id)))
                                    (sort-by page-sort-key)
                                    (map-indexed (fn [pos node]
                                                   (-> node
                                                       (assoc :position pos)
                                                       (dissoc ::max-score))))
                                    vec)]
               {:id       (:id block)
                :type     (if (dimension-anchored? block) "dimension" "metric")
                :name     (block-display-name block card-name-by-id (ambiguous? block))
                :position block-pos
                :pages    block-pages})))
          blocks)))
