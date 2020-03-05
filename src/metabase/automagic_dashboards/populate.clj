(ns metabase.automagic-dashboards.populate
  "Create and save models that make up automagic dashboards."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards.filters :as filters]
            [metabase.models
             [card :as card]
             [collection :as collection]]
            [metabase.query-processor.util :as qp.util]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(def ^Long grid-width
  "Total grid width."
  18)

(def ^Long default-card-width
  "Default card width."
  6)

(def ^Long default-card-height
  "Default card height"
  4)

(defn create-collection!
  "Create a new collection."
  [title color description parent-collection-id]
  (db/insert! 'Collection
    (merge
     {:name        title
      :color       color
      :description description}
     (when parent-collection-id
       {:location (collection/children-location (db/select-one ['Collection :location :id]
                                                  :id parent-collection-id))}))))

(defn get-or-create-root-container-collection
  "Get or create container collection for automagic dashboards in the root collection."
  []
  (or (db/select-one 'Collection
        :name     "Automatically Generated Dashboards"
        :location "/")
      (create-collection! "Automatically Generated Dashboards" "#509EE3" nil nil)))

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

(defn map-to-colors
  "Map given objects to distinct colors."
  [objs]
  (->> objs
       (map (comp colors #(mod % (count colors)) hash))
       ensure-distinct-colors))

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
                              filters/collect-field-references
                              (map filters/field-reference->id))
                         aggregation)]
        {:graph.colors (map-to-colors color-keys)}))))

(defn- visualization-settings
  [{:keys [metrics x_label y_label series_labels visualization dimensions] :as card}]
  (let [[display visualization-settings] visualization]
    {:display                display
     :visualization_settings (-> visualization-settings
                                 (assoc :graph.series_labels (map :name metrics)
                                        :graph.metrics       (map :op metrics)
                                        :graph.dimensions    dimensions)
                                 (merge (colorize card))
                                 (cond->
                                     series_labels (assoc :graph.series_labels series_labels)

                                     x_label       (assoc :graph.x_axis.title_text x_label)

                                     y_label       (assoc :graph.y_axis.title_text y_label)))}))

(defn- add-card
  "Add a card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard {:keys [title description dataset_query width height id] :as card} [x y]]
  (let [card (-> {:creator_id    api/*current-user-id*
                  :dataset_query dataset_query
                  :description   description
                  :name          title
                  :collection_id nil
                  :id            (or id (gensym))}
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
                    group (+ group-heading-height))]
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
         dashboard     {:name           title
                        :transient_name (or transient_title title)
                        :description    description
                        :creator_id     api/*current-user-id*
                        :parameters     []}
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
     (log/info (trs "Adding {0} cards to dashboard {1}:\n{2}"
                    (count cards)
                    title
                    (str/join "; " (map :title cards))))
     (cond-> dashboard
       (not-empty filters) (filters/add-filters filters max-filters)))))

(defn- downsize-titles
  [markdown]
  (->> markdown
       str/split-lines
       (map (fn [line]
              (if (str/starts-with? line "#")
                (str "#" line)
                line)))
       str/join))

(defn- merge-filters
  [ds]
  (when (->> ds
             (mapcat :ordered_cards)
             (keep (comp :table_id :card))
             distinct
             count
             (= 1))
   [(->> ds (mapcat :parameters) distinct)
    (->> ds
         (mapcat :ordered_cards)
         (mapcat :parameter_mappings)
         (map #(dissoc % :card_id))
         distinct)]))

(defn merge-dashboards
  "Merge dashboards `dashboard` into dashboard `target`."
  ([target dashboard] (merge-dashboards target dashboard {}))
  ([target dashboard {:keys [skip-titles?]}]
   (let [[paramters parameter-mappings] (merge-filters [target dashboard])
         offset                         (->> target
                                             :ordered_cards
                                             (map #(+ (:row %) (:sizeY %)))
                                             (apply max -1) ; -1 so it neturalizes +1 for spacing
                                                            ; if the target dashboard is empty.
                                             inc)
         cards                        (->> dashboard
                                           :ordered_cards
                                           (map #(-> %
                                                     (update :row + offset (if skip-titles?
                                                                             0
                                                                             group-heading-height))
                                                     (m/update-existing-in [:visualization_settings :text]
                                                                           downsize-titles)
                                                     (assoc :parameter_mappings
                                                       (when-let [card-id (:card_id %)]
                                                         (for [mapping parameter-mappings]
                                                           (assoc mapping :card_id card-id)))))))]
     (-> target
         (assoc :parameters paramters)
         (cond->
           (not skip-titles?)
           (add-text-card {:width                  grid-width
                           :height                 group-heading-height
                           :text                   (format "# %s" (:name dashboard))
                           :visualization-settings {:dashcard.background false
                                                    :text.align_vertical :bottom}}
                          [offset 0]))
         (update :ordered_cards concat cards)))))
