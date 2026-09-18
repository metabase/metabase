(ns metabase.explorations.blocks
  "Read-side: build the nested `blocks -> pages` structure the FE renders, from a thread's
   persisted `ExplorationBlock` + `ExplorationPage` rows and its hydrated query rows.

   Each block becomes one sidebar heading; within it, each persisted page becomes a child
   bundling that page's query ids (sorted by interestingness). The block heading and each
   page's display name are computed here — they're not persisted."
  (:require
   [clojure.string :as str]
   [metabase.explorations.query-plan.variants :as variants]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn page-url
  "Relative URL of a page in the exploration detail view. Used by the summary-append
  endpoint to deep-link a static `cardEmbed`'s title back to its page."
  [exploration-id page-id]
  (str "/question/research/" exploration-id "/page/" page-id))

;;; ------------------------------------------- names -------------------------------------------

(defn block-display-name
  "Sidebar heading for a block: its metric's name. `card-name-by-id` maps a metric Card id to
   its name. Public so the LLM planner context can label a block the same way the read tree
   does."
  [block card-name-by-id]
  (or (get card-name-by-id (:card_id (first (:metrics block)))) ""))

(defn- page-metric-name
  "The metric (Card) name for `page` — present even on an empty (comment-retained) page."
  [page card-name-by-id]
  (get card-name-by-id (:card_id page)))

(defn- page-dimension-label
  "The display label of `page`'s dimension, read off any of its queries; falls back to the raw
   `:dimension_id` for an empty page that has no queries to carry the resolved label."
  [page queries]
  (or (:dimension_name (first queries)) (:dimension_id page)))

(defn- page-qualifier
  "The variant qualifier (e.g. `over time`) for `page`, or `nil` for the default variant."
  [page]
  (let [qualifier (variants/variant-qualifier (:query_type page))]
    (when-not (str/blank? qualifier)
      qualifier)))

;; Each page-name shape below is one complete `tru` pattern (rather than appending the
;; qualifier to a shorter pattern) so translators can reorder the qualifier per language.

(defn- page-long-name
  "A page's full, self-describing name, generated from parts: `<metric> by <dimension>
   <variant>` (e.g. `Number of Orders by Category over time`). Self-contained — used where a
   page is shown without its block heading for context (e.g. comment deep-links)."
  [page queries card-name-by-id]
  (let [metric (page-metric-name page card-name-by-id)
        dim    (page-dimension-label page queries)]
    (if-let [qualifier (page-qualifier page)]
      (tru "{0} by {1} {2}" metric dim qualifier)
      (tru "{0} by {1}" metric dim))))

(defn- page-short-name
  "A page's name with the axis its block heading already shows removed: the heading is the
   metric, and the pages vary by dimension, so `<dimension> <variant>`."
  [page queries]
  (let [qualifier (page-qualifier page)
        dim       (page-dimension-label page queries)]
    (if qualifier
      (str dim " " qualifier)
      dim)))

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
  [page queries card-name-by-id]
  {:id          (:id page)
   :name        (page-short-name page queries)
   :long_name   (page-long-name page queries card-name-by-id)
   :query_ids   (mapv :id queries)
   :starred     (:starred page)
   :hidden      (:hidden page)
   ::max-score  (max-score queries)})

(defn blocks-tree
  "Given a thread's persisted `ExplorationBlock` rows (authoring order), its `ExplorationPage`
   rows, and its hydrated query rows, return the nested vector the FE renders:

       [{:id       <block-pk>
         :name     <computed heading>
         :position <0-indexed slot among blocks>
         :pages    [{:id        <page-pk>
                     :name      <short page name, heading-relative>
                     :long_name <full self-describing page name>
                     :position  <0-indexed slot among the block's pages, score-sorted>
                     :query_ids [<id> <id> ...]
                     :starred   <true | false>
                     :hidden    <true | false>}]}]

   Pages are sorted by interestingness desc within their block. Pages whose block isn't in
   `blocks` are dropped; queries are matched to their page via `page_id`."
  [blocks pages card-name-by-id queries]
  (let [queries-by-page (group-by :page_id queries)
        pages-by-block  (group-by :exploration_block_id pages)]
    (into []
          (map-indexed
           (fn [block-pos block]
             (let [block-pages (->> (get pages-by-block (:id block) [])
                                    (map (fn [page]
                                           (page-node page
                                                      (get queries-by-page (:id page) [])
                                                      card-name-by-id)))
                                    (sort-by page-sort-key)
                                    (map-indexed (fn [pos node]
                                                   (-> node
                                                       (assoc :position pos)
                                                       (dissoc ::max-score))))
                                    vec)]
               {:id              (:id block)
                :name            (block-display-name block card-name-by-id)
                :position        block-pos
                :explore_filters (:explore_filters (first (:metrics block)))
                :pages           block-pages})))
          blocks)))
