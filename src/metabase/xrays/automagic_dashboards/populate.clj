(ns metabase.xrays.automagic-dashboards.populate
  "Create and save models that make up automagic dashboards."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.appearance.core :as appearance]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema :as lib.schema]
   [metabase.queries.core :as queries]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.automagic-dashboards.filters :as filters]
   [metabase.xrays.automagic-dashboards.schema :as ads]
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

(defn get-or-create-container-collection
  "Get or create container collection for automagic dashboards in a given location."
  [location]
  (or (t2/select-one :model/Collection
                     :name "Automatically Generated Dashboards"
                     :archived false
                     :location location)
      (t2/insert-returning-instance!
       :model/Collection
       {:name "Automatically Generated Dashboards"
        :location location})))

(defn colors
  "A vector of colors used for coloring charts. Uses [[appearance/application-colors]] for user choices."
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
                          (appearance/application-colors))]
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
  "Pick the chart colors according to the following rules:
  * If there is more than one breakout dimension let the frontend do it as presumably
    the second dimension will be used as color key and we can't know the values it
    will take at this stage.
  * If the visualization is a bar or row chart with `count` as the aggregation
    (ie. a frequency chart), use field IDs referenced in `:breakout` as color key.
  * Else use `:aggregation` as color key.

  Colors are then determined by using the hashes of color keys to index into the vector
  of available colors."
  [{:keys [visualization dataset_query], :as _dashcard}]
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
    :as   dashcard}]
  (let [{:keys [aggregation]}            metric-definition
        [display visualization-settings] visualization
        viz-dims (mapv
                  (comp :name dimension-name->field ffirst)
                  dimensions)]
    {:display                display
     :visualization_settings (-> visualization-settings
                                 (assoc :graph.series_labels (map :name metrics)
                                        :graph.metrics (mapv first aggregation)
                                        :graph.dimensions (seq viz-dims))
                                 (merge (colorize dashcard))
                                 (cond->
                                  series_labels (assoc :graph.series_labels series_labels)
                                  x_label (assoc :graph.x_axis.title_text x_label)
                                  y_label (assoc :graph.y_axis.title_text y_label)))}))

(defn dashcard-defaults
  "Default properties for a dashcard on magic dashboard."
  []
  {:id                     (gensym)
   :dashboard_tab_id       nil
   :visualization_settings {}})

(mu/defn- add-normal-dashcard :- ::ads/dashboard
  "Add a card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard :- ::ads/dashboard
   {query :dataset_query, :keys [title description width height id] :as dashcard} :- ::ads/card-template
   [x y]]
  (let [query-fields (when query
                       ;; disable ref validation because X-Rays does stuff in a wacko manner, it adds a bunch of
                       ;; filters and whatever that use columns from joins before adding the joins themselves (same
                       ;; with expressions), which is technically invalid at the time it happens but ends up resulting
                       ;; in a valid query at the end of the day. Maybe one day we can rework this code to be saner
                       (binding [lib.schema/*HACK-disable-ref-validation* true]
                         (-> {:dataset_query (lib-be/normalize-query query)}
                             queries/populate-card-query-fields
                             (select-keys [:query_type :database_id :table_id]))))
        card         (merge
                      {:creator_id    api/*current-user-id*
                       :dataset_query query
                       :description   description
                       :name          title
                       :collection_id nil
                       :id            (or id (gensym))}
                      (visualization-settings dashcard)
                      query-fields)]
    (update dashboard :dashcards conj
            (merge (dashcard-defaults)
                   {:col                    y
                    :row                    x
                    :size_x                 width
                    :size_y                 height
                    :card                   card
                    :card_id                (:id card)
                    :visualization_settings {}}))))

(mu/defn add-text-card :- ::ads/dashboard
  "Add a text card to dashboard `dashboard` at position [`x`, `y`]."
  [dashboard :- ::ads/dashboard
   {:keys [text width height visualization-settings]} :- ::ads/card-template
   [x y] :- [:tuple nat-int? nat-int?]]
  (update dashboard :dashcards conj
          (merge (dashcard-defaults)
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
                  :size_y                 height})))

(mr/def ::grid
  [:sequential [:sequential :boolean]])

(mu/defn- make-grid :- ::grid
  [width  :- nat-int?
   height :- nat-int?]
  (vec (repeat height (vec (repeat width false)))))

(mu/defn- fill-grid :- ::grid
  "Mark a rectangular area starting at [`x`, `y`] of size [`width`, `height`] as
   occupied."
  [grid                                  :- ::grid
   [x y]                                 :- [:tuple nat-int? nat-int?]
   {:keys [width height], :as _dashcard} :- [:map
                                             [:width nat-int?]
                                             [:height nat-int?]]]
  (reduce (fn [grid xy]
            (assoc-in grid xy true))
          grid
          (for [x (range x (+ x height))
                y (range y (+ y width))]
            [x y])))

(mu/defn- accommodates?
  "Can we place card on grid starting at [x y] (top left corner)?
   Since we are filling the grid top to bottom and the cards are rectangular,
   it suffices to check just the first (top) row."
  [grid                   :- ::grid
   [x y]                  :- [:tuple nat-int? nat-int?]
   {:keys [width height]} :- [:map
                              [:width nat-int?]
                              [:height nat-int?]]]
  (and (<= (+ x height) (count grid))
       (<= (+ y width) (-> grid first count))
       (every? false? (subvec (grid x) y (+ y width)))))

(mu/defn- dashcard-position
  "Find position on the grid where to put the card.
   We use the dumbest possible algorithm (the grid size is relatively small, so
   we should be fine): starting at top left move along the grid from left to
   right, row by row and try to place the card at each position until we find an
   unoccupied area. Mark the area as occupied."
  [grid :- ::grid
   start-row
   dashcard]
  (reduce (fn [grid xy]
            (if (accommodates? grid xy dashcard)
              (reduced xy)
              grid))
          grid
          (for [x (range start-row (count grid))
                y (range (count (first grid)))]
            [x y])))

(mu/defn- bottom-row
  "Find the bottom of the grid. Bottom is the first completely empty row with
   another empty row below it."
  [grid :- ::grid]
  (let [row {:height 0, :width grid-width}]
    (loop [bottom (long 0)]
      (let [[bottom _]      (dashcard-position grid bottom row)
            [next-bottom _] (dashcard-position grid (inc bottom) row)]
        (if (= (inc bottom) next-bottom)
          bottom
          (recur (long next-bottom)))))))

(def ^:private ^{:arglists '([card])} text-card?
  :text)

(def ^:private ^Long ^:const group-heading-height 2)

(mu/defn- add-group :- [:tuple ::ads/dashboard ::grid]
  [dashboard :- ::ads/dashboard
   grid      :- ::grid
   group
   cards     :- [:sequential ::ads/card-template]]
  (let [start-row (bottom-row grid)
        start-row (cond-> start-row
                    group (+ group-heading-height))]
    (reduce (fn [[dashboard grid] dashcard]
              (let [xy (dashcard-position grid start-row dashcard)]
                [(if (text-card? dashcard)
                   (add-text-card dashboard dashcard xy)
                   (add-normal-dashcard dashboard dashcard xy))
                 (fill-grid grid xy dashcard)]))
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

(mu/defn- shown-cards :- [:sequential ::ads/card-template]
  "Pick up to `max-cards` with the highest `:card-score`.
   Keep groups together if possible by pulling all the cards within together and
   using the same (highest) card-score for all.
   Among cards with the same card-score those belonging to the largest group are
   favourized, but it is still possible that not all cards in a group make it
   (consider a group of 4 cards which starts as 7/9; in that case only 2 cards
   from the group will be picked)."
  [max-cards :- nat-int?
   cards     :- [:maybe [:sequential ::ads/card-template]]]
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

(mu/defn- create-dashboard-populate-dashcards :- [:sequential ::ads/dashcard]
  [dashcards :- [:maybe [:sequential ::ads/card-template]]]
  ;; disable ref validation because X-Rays does stuff in a wacko manner, it adds a bunch of filters and whatever that
  ;; use columns from joins before adding the joins themselves (same with expressions), which is technically invalid
  ;; at the time it happens but ends up resulting in a valid query at the end of the day. Maybe one day we can rework
  ;; this code to be saner
  (let [card-id->can-run-adhoc-query (binding [lib.schema/*HACK-disable-ref-validation* true]
                                       (into {}
                                             (map (juxt ::id :can_run_adhoc_query))
                                             (queries/with-can-run-adhoc-query
                                               (for [{:keys [card]} dashcards
                                                     :when          (and (:id card)
                                                                         (:dataset_query card))]
                                                 (-> card
                                                     (update :dataset_query lib-be/normalize-query)
                                                     (set/rename-keys {:id ::id}))))))]
    (for [dashcard dashcards
          :let     [card (:card dashcard)
                    card (when (seq card)
                           (assoc card :can_run_adhoc_query (get card-id->can-run-adhoc-query (:id card))))]]
      (u/assoc-dissoc dashcard :card card))))

(mu/defn create-dashboard :- ::ads/dashboard
  "Create dashboard and populate it with cards."
  ([dashboard] (create-dashboard dashboard :all))
  ([{:keys [title transient_title description groups filters cards]} :- ::ads/dashboard-template
    n :- [:or pos-int? :keyword]]
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
         dashboard     (update dashboard :dashcards create-dashboard-populate-dashcards)]
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
                                             (apply max -1) ; -1 so it neturalizes +1 for spacing if the target dashboard is empty.
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
         (cond-> (not skip-titles?)
           (add-text-card {:width                  grid-width
                           :height                 group-heading-height
                           :text                   (format "# %s" (:name dashboard))
                           :visualization-settings {:dashcard.background false
                                                    :text.align_vertical :bottom}}
                          [offset 0]))
         (update :dashcards concat cards)))))
