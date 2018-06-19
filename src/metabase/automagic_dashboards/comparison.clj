(ns metabase.automagic-dashboards.comparison
  #_(:require [clojure.string :as str]
              [metabase.api.common :as api]
              [metabase.automagic-dashboards
               [populate :as populate]]))

;; (defn- dashboard->cards
;;   [dashboard]
;;   (->> dashboard
;;        :ordered_cards
;;        (map (fn [{:keys [sizeY card col row series]}]
;;               (assoc card
;;                 :series   series
;;                 :height   sizeY
;;                 :position (+ (* row populate/grid-width) col))))
;;        (sort-by :position)))

;; (defn- clone-card
;;   [card]
;;   (-> card
;;       (select-keys [:dataset_query :description :display :name :result_metadata
;;                     :visualization_settings])
;;       (assoc :creator_id    api/*current-user-id*
;;              :collection_id (:id (populate/automagic-collection))
;;              :id            (gensym))))

;; (defn- overlay-comparison?
;;   [card]
;;   (and (-> card :display name (#{"bar" "line"}))
;;        (-> card :series empty?)))

;; (defn- place-row
;;   [dashboard row left right]
;;   (let [height       (:height left)
;;         card-left    (clone-card left)
;;         card-right   (clone-card right)]
;;     (if (overlay-comparison? left)
;;       (update dashboard :ordered_cards conj {:col                    0
;;                                              :row                    row
;;                                              :sizeX                  populate/grid-width
;;                                              :sizeY                  height
;;                                              :card                   card-left
;;                                              :card_id                (:id card-left)
;;                                              :series                 [card-right]
;;                                              :visualization_settings {}
;;                                              :id                     (gensym)})
;;       (let [width (/ populate/grid-width 2)
;;             series-left  (map clone-card (:series left))
;;             series-right (map clone-card (:series right))]
;;         (-> dashboard
;;             (update :ordered_cards conj {:col                    0
;;                                          :row                    row
;;                                          :sizeX                  width
;;                                          :sizeY                  height
;;                                          :card                   card-left
;;                                          :card_id                (:id card-left)
;;                                          :series                 series-left
;;                                          :visualization_settings {}
;;                                          :id                     (gensym)})
;;             (update :ordered_cards conj {:col                    width
;;                                          :row                    row
;;                                          :sizeX                  width
;;                                          :sizeY                  height
;;                                          :card                   card-right
;;                                          :card_id                (:id card-right)
;;                                          :series                 series-right
;;                                          :visualization_settings {}
;;                                          :id                     (gensym)}))))))

;; (def ^:private ^Long ^:const title-height 2)

;; (defn- add-col-title
;;   [dashboard title col]
;;   (populate/add-text-card dashboard {:text   (format "# %s" title)
;;                                      :width  (/ populate/grid-width 2)
;;                                      :height title-height}
;;                           [0 col]))

;; (defn- unroll-multiseries
;;   [card]
;;   (if (and (-> card :display name (= "line"))
;;            (-> card :dataset_query :query :aggregation count (> 1)))
;;     (for [aggregation (-> card :dataset_query :query :aggregation)]
;;       (assoc-in card [:dataset_query :query :aggregation] [aggregation]))
;;     [card]))

;; (defn- inject-segment
;;   "Inject filter clause into card."
;;   [query-filter card]
;;   (-> card
;;       (update-in [:dataset_query :query :filter] merge-filters query-filter)
;;       (update :series (partial map (partial inject-segment query-filter)))))

(defn comparison-dashboard
  "Create a comparison dashboard based on dashboard `dashboard` comparing subsets of
   the dataset defined by segments `left` and `right`."
  [dashboard left right]
  ;; (->> dashboard
  ;;      dashboard->cards
  ;;      (mapcat unroll-multiseries)
  ;;      (map (juxt (partial inject-segment left)
  ;;                 (partial inject-segment right)))
  ;;      (reduce (fn [[dashboard row] [left right]]
  ;;                [(place-row dashboard row left right)
  ;;                 (+ row (:height left))])
  ;;              [(-> {:name        (format "Comparison of %s and %s"
  ;;                                         (full-name left)
  ;;                                         (full-name right))
  ;;                    :description (format "Automatically generated comparison dashboard comparing %s and %s"
  ;;                                         (full-name left)
  ;;                                         (full-name right))
  ;;                    :creator_id  api/*current-user-id*
  ;;                    :parameters  []}
  ;;                   (add-col-title (-> left full-name str/capitalize) 0)
  ;;                   (add-col-title (-> right full-name str/capitalize)
  ;;                                  (/ populate/grid-width 2)))
  ;;               title-height])
  ;;      first)
  )
