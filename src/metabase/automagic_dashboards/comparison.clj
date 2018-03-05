(ns metabase.automagic-dashboards.comparison
  (:require [metabase.api.common :as api]
            [metabase.automagic-dashboards.populate :as populate]))

(defn- dashboard->cards
  [dashboard]
  (->> dashboard
       :orderd_cards
       (map (fn [{:keys [sizeY card col row]}]
              (assoc card
                :height   sizeY
                :position (+ (* row populate/grid-width) col))))
       (sort-by :position)))

(defn- inject-segment
  [segment card]
  (update-in card [:dataset_query :query :filter]
             (fn [filter-clause]
               (cond->> (-> segment :definition :filter)
                 (not-empty filter-clause) (vector :and filter-clause)))))

(defn- clone-card
  [card]
  (-> card
      (assoc :creator_id    api/*current-user-id*
             :collection_id (-> populate/automagic-collection deref :id))
      (dissoc :height :position :id)))

(defn- place-row
  [dashboard row height left right]
  [(if (-> left :display (#{:bar :line}))
     (update dashboard :orderd_cards conj {:col    0
                                           :row    row
                                           :sizeX  populate/grid-width
                                           :sizeY  height
                                           :series [right]})
     (let [width (/ populate/grid-width 2)]
       (-> dashboard
           (update :ordered_cards conj {:col   0
                                        :row   row
                                        :sizeX width
                                        :sizeY height
                                        :card  left})
           (update :ordered_cards conj {:col   width
                                        :row   row
                                        :sizeX width
                                        :sizeY height
                                        :card  right}))))
   (+ row height)])

(def ^:private ^Long title-height 2)

(defn- add-col-title
  [dashboard title col]
  (populate/add-text-card dashboard {:text   (format "# %s" title)
                                     :width  (/ populate/grid-width 2)
                                     :height title-height}
                          [0 col]))

(defn- unroll-multiseries
  [card]
  (if (and (-> card :display (= :line))
           (-> card :dataset_query :query :aggregation count (> 1)))
    (for [aggregation (-> card :dataset_query :query :aggregation)]
      (assoc-in card [:dataset_query :query :aggregation] [aggregation]))
    [card]))

(defn comparison-dashboard
  "Create a comparison dashboard based on dashboard `dashboard` comparing subsets of
   the dataset defined by filter expressions `left` and `right`."
  [dashboard left right]
  (let [dashboard {:name        (format "Comparison of %s and %s"
                                        (:name left)
                                        (:name right))
                   :description (format "Automatically generated comparison dashboard comparing segments %s and %s"
                                        (:name left)
                                        (:name right))
                   :creator_id  api/*current-user-id*
                   :parameters  []}]
    (->> dashboard
         dashboard->cards
         (mapcat unroll-multiseries)
         (map (juxt (partial inject-segment left)
                    (partial inject-segment right)))
         (reduce (fn [[dashboard row] [left right]]
                   (place-row dashboard row (:height left)
                              (clone-card left)
                              (clone-card right)))
                 [(-> dashboard
                      (add-col-title (:name left)  0)
                      (add-col-title (:name right) (/ populate/grid-width 2)))
                  title-height]))))
