(ns metabase.xrays.automagic-dashboards.populate
  "Create and save models that make up automagic dashboards."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.models.card :as card]
   [metabase.models.collection :as collection]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.log :as log]
   [metabase.xrays.automagic-dashboards.filters :as filters]
   [metabase.xrays.automagic-dashboards.util :as magic.util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^Long grid-width
  "Total grid width."
  24)

(def ^Long default-card-width
  "Default card width."
  12)

(def ^Long default-card-height
  "Default card height"
  6)

(defn create-collection!
  "Create and return a new collection."
  [title description parent-collection-id]
  (first (t2/insert-returning-instances!
           'Collection
           (merge
             {:name        title
              :description description}
             (when parent-collection-id
               {:location (collection/children-location (t2/select-one ['Collection :location :id]
                                                                       :id parent-collection-id))})))))

(defn get-or-create-root-container-collection
  "Get or create container collection for automagic dashboards in the root collection."
  []
  (or (t2/select-one 'Collection
        :name     "Automatically Generated Dashboards"
        :location "/")
      (create-collection! "Automatically Generated Dashboards" nil nil)))

(defn colors
  "A vector of colors used for coloring charts. Uses [[public-settings/application-colors]] for user choices."
  []
  (let [order [:brand :accent1 :accent2 :accent3 :accent4 :accent5 :accent6 :accent7]
        colors-map (merge {:brand   "#509EE3"
                           :accent1 "#88BF4D"
                           :accent2 "#A989C5"
                           :accent3 "#EF8C8C"
                           :accent4 "#F9D45C"
                           :accent5 "#F2A86F"
                           :accent6 "#98D9D9"
                           :accent7 "#7172AD"}
                          (public-settings/application-colors))]
    (into [] (map colors-map) order)))

(defn- ensure-distinct-colors
  [candidates]
  (->> candidates
       frequencies
       (reduce-kv
        (fn [acc color count]
          (if (= count 1)
            (conj acc color)
            (concat acc [color (first (drop-while (conj (set acc) color) (colors)))])))
        [])))

(defn map-to-colors
  "Map given objects to distinct colors."
  [objs]
  (->> objs
       (map (comp (colors) #(mod % (count (colors))) hash))
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
                              magic.util/collect-field-references
                              (map magic.util/field-reference->id))
                         aggregation)]
        {:graph.colors (map-to-colors color-keys)}))))

(defn- visualization-settings
  [{:keys [metrics x_label y_label series_labels visualization
           dimensions dimension-name->field metric-definition]
    :as   card}]
  (let [{:keys [aggregation]} metric-definition
        [display visualization-settings] visualization
        viz-dims (mapv
                   (comp :name dimension-name->field ffirst)
                   dimensions)]
    {:display                display
     :visualization_settings (-> visualization-settings
                                 (assoc :graph.series_labels (map :name metrics)
                                        :graph.metrics (mapv first aggregation)
                                        :graph.dimensions (seq viz-dims))
                                 (merge (colorize card))
                                 (cond->
                                   series_labels (assoc :graph.series_labels series_labels)

                                   x_label (assoc :graph.x_axis.title_text x_label)

                                   y_label (assoc :graph.y_axis.title_text y_label)))}))


(defn card-defaults
  "Default properties for a dashcard on magic dashboard."
  []
  {:id                     (gensym)
   :dashboard_tab_id       nil
   :visualization_settings {}})

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
    (update dashboard :dashcards conj
            (merge (card-defaults)
             {:col                    y
              :row                    x
              :size_x                 width
              :size_y                 height
              :card                   card
              :card_id                (:id card)
              :visualization_settings {}}))))

(defn add-text-card
  "Add a text card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard {:keys [text width height visualization-settings]} [x y]]
  (update dashboard :dashcards conj
          (merge (card-defaults)
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
                  :size_x                 width
                  :size_y                 height
                  :card                   nil})))

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
  (let [row {:height 0, :width grid-width}]
    (loop [bottom (long 0)]
      (let [[bottom _]      (card-position grid bottom row)
            [next-bottom _] (card-position grid (inc bottom) row)]
        (if (= (inc bottom) next-bottom)
          bottom
          (recur (long next-bottom)))))))

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
  "Pick up to `max-cards` with the highest `:card-score`.
   Keep groups together if possible by pulling all the cards within together and
   using the same (highest) card-score for all.
   Among cards with the same card-score those beloning to the largest group are
   favourized, but it is still possible that not all cards in a group make it
   (consider a group of 4 cards which starts as 7/9; in that case only 2 cards
   from the group will be picked)."
  [max-cards cards]
  (->> cards
       (sort-by :card-score >)
       (take max-cards)
       (group-by (some-fn :group hash))
       (map (fn [[_ group]]
              {:cards    (sort-by :position group)
               :position (apply min (map :position group))}))
       (sort-by :position)
       (mapcat :cards)))

(def ^:private ^:const ^Long max-filters 4)

(defn ordered-group-by-seq
  "A seq from a group-by in a particular order. If you don't need the map itself, just to get the key value pairs in a
  particular order. Clojure's `sorted-map-by` doesn't handle distinct keys with the same score. So this just iterates
  over the groupby in a reasonable order."
  [f key-order coll]
  (letfn [(access [ks grouped]
            (if (seq ks)
              (let [k (first ks)]
                (lazy-seq
                 (if-let [x (find grouped k)]
                   (cons x (access (next ks) (dissoc grouped k)))
                   (access (next ks) grouped))))
              (seq grouped)))]
    (let [g (group-by f coll)]
      (access key-order g))))

(defn create-dashboard
  "Create dashboard and populate it with cards."
  ([dashboard] (create-dashboard dashboard :all))
  ([{:keys [title transient_title description groups filters cards]} n]
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
                            (ordered-group-by-seq :group
                                                  (when groups
                                                    (sort-by (comp (fnil - 0) :score groups)
                                                             (keys groups))))
                            (reduce (fn [[dashboard grid] [group-name cards]]
                                      (let [group (get groups group-name)]
                                        (add-group dashboard grid group cards)))
                                    [dashboard
                                     ;; Height doesn't need to be precise, just some
                                     ;; safe upper bound.
                                     (make-grid grid-width (* n grid-width))]))
         dashboard (update dashboard :dashcards (fn [dashcards]
                                                  (let [cards (map :card dashcards)]
                                                    (mapv
                                                     (fn [dashcard card]
                                                       (m/assoc-some dashcard :card card))
                                                     dashcards
                                                     (card/with-can-run-adhoc-query cards)))))]

     (log/debugf "Adding %s cards to dashboard %s:\n%s"
                 (count cards)
                 title
                 (str/join "; " (map :title cards)))
     (cond-> (update dashboard :dashcards (partial sort-by (juxt :row :col)))
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
             (mapcat :dashcards)
             (keep (comp :table_id :card))
             distinct
             count
             (= 1))
   [(->> ds (mapcat :parameters) distinct)
    (->> ds
         (mapcat :dashcards)
         (mapcat :parameter_mappings)
         (map #(dissoc % :card_id))
         distinct)]))

(defn merge-dashboards
  "Merge dashboards `dashboard` into dashboard `target`."
  ([target dashboard] (merge-dashboards target dashboard {}))
  ([target dashboard {:keys [skip-titles?]}]
   (let [[parameters parameter-mappings] (merge-filters [target dashboard])
         offset                         (->> target
                                             :dashcards
                                             (map #(+ (:row %) (:size_y %)))
                                             (apply max -1) ; -1 so it neturalizes +1 for spacing
                                                            ; if the target dashboard is empty.
                                             inc)
         cards                        (->> dashboard
                                           :dashcards
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
         (assoc :parameters parameters)
         (cond->
           (not skip-titles?)
           (add-text-card {:width                  grid-width
                           :height                 group-heading-height
                           :text                   (format "# %s" (:name dashboard))
                           :visualization-settings {:dashcard.background false
                                                    :text.align_vertical :bottom}}
                          [offset 0]))
         (update :dashcards concat cards)))))
