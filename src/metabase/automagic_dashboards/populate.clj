(ns metabase.automagic-dashboards.populate
  "Create and save models that make up automagic dashboards."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.filters :as magic.filters]
            [metabase.models.card :as card]
            [metabase.query-processor.util :as qp.util]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^Long ^:const grid-width
  "Total grid width."
  18)
(def ^Long ^:const default-card-width
  "Default card width."
  6)
(def ^Long ^:const default-card-height
  "Default card height"
  4)

(defn create-collection!
  "Create a new collection."
  [title color description]
  (when api/*is-superuser?*
    (db/insert! 'Collection
      :name        title
      :color       color
      :description description)))

(def colors
  "Colors used for coloring charts and collections."
  ["#509EE3" "#9CC177" "#A989C5" "#EF8C8C" "#f9d45c" "#F1B556" "#A6E7F3" "#7172AD"])

(defn- ensure-distinct-colors
  [candidates]
  (->> candidates
       frequencies
       (reduce-kv
        (fn [acc color count]
          (if (= count 1)
            (conj acc color)
            (concat acc [color (first (drop-while (conj (set acc) color) colors))])))
        [])))

(defn- colorize
  "Pick the chart colors acording to the following rules:
  * If there is more than one breakout dimension let the frontend do it as presumably
    the second dimension will be used as color key and we can't know the values it
    will take at this stage.
  * If the visualization is a bar or row chart with `count` as the aggregation
    (ie. a frequency chart), use field IDs referenced in `:breakout` as color key.
  * Else use `:aggregation` as color key.

  Colors are then determined by using the hashs of color keys to index into the vector
  of available colors."
  [{:keys [visualization dataset_query]}]
  (let [display     (first visualization)
        breakout    (-> dataset_query :query :breakout)
        aggregation (-> dataset_query :query :aggregation)]
    (when (and (#{"line" "row" "bar" "scatter" "area"} display)
               (= (count breakout) 1))
      (let [color-keys (if (and (#{"bar" "row"} display)
                                (some->> aggregation
                                         flatten
                                         first
                                         qp.util/normalize-token
                                         (= :count)))
                         (->> breakout
                              (tree-seq sequential? identity)
                              (filter magic.filters/field-form?)
                              (map last))
                         aggregation)]
        {:graph.colors (->> color-keys
                            (map (comp colors #(mod % (count colors)) hash))
                            ensure-distinct-colors)}))))

(defn- visualization-settings
  [{:keys [metrics x_label y_label series_labels visualization dimensions] :as card}]
  (let [metric-name (some-fn :name (comp str/capitalize name first :metric))
        [display visualization-settings] visualization]
    {:display display
     :visualization_settings
     (-> visualization-settings
         (merge (colorize card))
         (cond->
           (some :name metrics) (assoc :graph.series_labels (map metric-name metrics))
           series_labels        (assoc :graph.series_labels series_labels)
           x_label              (assoc :graph.x_axis.title_text x_label)
           y_label              (assoc :graph.y_axis.title_text y_label)))}))

(defn- add-card
  "Add a card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard {:keys [title description dataset_query width height]
              :as card} [x y]]
  (let [card (-> {:creator_id    api/*current-user-id*
                  :dataset_query dataset_query
                  :description   description
                  :name          title
                  :collection_id nil
                  :id            (gensym)}
                 (merge (visualization-settings card))
                 card/populate-query-fields)]
    (update dashboard :ordered_cards conj {:col                    y
                                           :row                    x
                                           :sizeX                  width
                                           :sizeY                  height
                                           :card                   card
                                           :card_id                (:id card)
                                           :visualization_settings {}
                                           :id                     (gensym)})))

(defn add-text-card
  "Add a text card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard {:keys [text width height visualization-settings]} [x y]]
  (update dashboard :ordered_cards conj
          {:creator_id             api/*current-user-id*
           :visualization_settings (merge
                                    {:text         text
                                     :virtual_card {:name                   nil
                                                    :display                :text
                                                    :dataset_query          {}
                                                    :visualization_settings {}}}
                                    visualization-settings)
           :col                    y
           :row                    x
           :sizeX                  width
           :sizeY                  height
           :card                   nil
           :id                     (gensym)}))

(defn- make-grid
  [width height]
  (vec (repeat height (vec (repeat width false)))))

(defn- fill-grid
  "Mark a rectangular area starting at [`x`, `y`] of size [`width`, `height`] as
   occupied."
  [grid [x y] {:keys [width height]}]
  (reduce (fn [grid xy]
            (assoc-in grid xy true))
          grid
          (for [x (range x (+ x height))
                y (range y (+ y width))]
            [x y])))

(defn- accomodates?
  "Can we place card on grid starting at [x y] (top left corner)?
   Since we are filling the grid top to bottom and the cards are rectangulard,
   it suffices to check just the first (top) row."
  [grid [x y] {:keys [width height]}]
  (and (<= (+ x height) (count grid))
       (<= (+ y width) (-> grid first count))
       (every? false? (subvec (grid x) y (+ y width)))))

(defn- card-position
  "Find position on the grid where to put the card.
   We use the dumbest possible algorithm (the grid size is relatively small, so
   we should be fine): startting at top left move along the grid from left to
   right, row by row and try to place the card at each position until we find an
   unoccupied area. Mark the area as occupied."
  [grid start-row card]
  (reduce (fn [grid xy]
            (if (accomodates? grid xy card)
              (reduced xy)
              grid))
          grid
          (for [x (range start-row (count grid))
                y (range (count (first grid)))]
            [x y])))

(defn- bottom-row
  "Find the bottom of the grid. Bottom is the first completely empty row with
   another empty row below it."
  [grid]
  (let [row {:height 0 :width grid-width}]
    (loop [bottom 0]
      (let [[bottom _]      (card-position grid bottom row)
            [next-bottom _] (card-position grid (inc bottom) row)]
        (if (= (inc bottom) next-bottom)
          bottom
          (recur next-bottom))))))

(def ^:private ^{:arglists '([card])} text-card?
  :text)

(def ^:private ^Long ^:const group-heading-height 2)

(defn- add-group
  [dashboard grid group cards]
  (let [start-row (bottom-row grid)
        start-row (cond-> start-row
                    group            (+ group-heading-height))]
    (reduce (fn [[dashboard grid] card]
              (let [xy (card-position grid start-row card)]
                [(if (text-card? card)
                   (add-text-card dashboard card xy)
                   (add-card dashboard card xy))
                 (fill-grid grid xy card)]))
            (if group
              (let [xy   [(- start-row 2) 0]
                    card {:text                   (format "# %s" (:title group))
                          :width                  grid-width
                          :height                 group-heading-height
                          :visualization-settings {:dashcard.background false
                                                   :text.align_vertical :bottom}}]
                [(add-text-card dashboard card xy)
                 (fill-grid grid xy card)])
              [dashboard grid])
            cards)))

(defn- shown-cards
  "Pick up to `max-cards` with the highest `:score`.
   Keep groups together if possible by pulling all the cards within together and
   using the same (highest) score for all.
   Among cards with the same score those beloning to the largest group are
   favourized, but it is still possible that not all cards in a group make it
   (consider a group of 4 cards which starts as 7/9; in that case only 2 cards
   from the group will be picked)."
  [max-cards cards]
  (->> cards
       (sort-by :score >)
       (take max-cards)
       (group-by (some-fn :group hash))
       (map (fn [[_ group]]
              {:cards    (sort-by :position group)
               :position (apply min (map :position group))}))
       (sort-by :position)
       (mapcat :cards)))

(def ^:private ^:const ^Long max-filters 4)

(defn create-dashboard
  "Create dashboard and populate it with cards."
  ([dashboard] (create-dashboard dashboard :all))
  ([{:keys [title transient_title description groups filters cards refinements]} n]
   (let [n             (cond
                         (= n :all)   (count cards)
                         (keyword? n) (Integer/parseInt (name n))
                         :else        n)
         dashboard     {:name              title
                        :transient_name    (or transient_title title)
                        :transient_filters (magic.filters/applied-filters refinements)
                        :description       description
                        :creator_id        api/*current-user-id*
                        :parameters        []}
         cards         (shown-cards n cards)
         [dashboard _] (->> cards
                            (partition-by :group)
                            (reduce (fn [[dashboard grid] cards]
                                      (let [group (some-> cards first :group groups)]
                                        (add-group dashboard grid group cards)))
                                    [dashboard
                                     ;; Height doesn't need to be precise, just some
                                     ;; safe upper bound.
                                     (make-grid grid-width (* n grid-width))]))]
     (log/info (format "Adding %s cards to dashboard %s:\n%s"
                       (count cards)
                       title
                       (str/join "; " (map :title cards))))
     (cond-> dashboard
       (not-empty filters) (magic.filters/add-filters filters max-filters)))))

(defn merge-dashboards
  "Merge dashboards `ds` into dashboard `d`."
  [d & ds]
  (reduce (fn [target dashboard]
            (let [offset (->> dashboard
                              :ordered_cards
                              (map #(+ (:row %) (:sizeY %)))
                              (apply max -2) ; -2 so it neturalizes +2 for spacing if
                                             ; the target dashboard is empty.
                              (+ 2))]
              (-> target
                  (add-text-card {:width  default-card-width
                                  :height group-heading-height
                                  :text   (:name dashboard)}
                                 [offset 0])
                  (update :ordered_cards concat
                          (->> dashboard
                               :ordered_cards
                               (map #(update :row + offset group-heading-height))))
                  (update :parameters concat (:parameters dashboard)))))
          d
          ds))
