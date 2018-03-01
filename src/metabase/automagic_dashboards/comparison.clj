(ns metabase.automagic-dashboards.comparison
  (:require [metabase.api
             [common :as api]
             [card :as card.api]]
            [metabase.automagic-dashboards.populate :as populate]
            [metabase.models
             [card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [segment :refer [Segment]]]
            [toucan.db :as db]))

(defn- dashboard->cards
  [dashboard]
  (->> (db/select DashboardCard :dashboard_id (:id dashboard))
       (map (fn [{:keys [sizeY card_id col row]}]
              (assoc (Card card_id)
                :height   sizeY
                :position (+ (* row populate/grid-width) col))))
       (sort-by :position)))

(defn- inject-segment
  [segment card]
  (update-in card [:dataset_query :query :filter]
             (fn [filter-clause]
               (cond->> (-> segment :definition :filter)
                 (not-empty filter-clause) (vector :and filter-clause)))))

(defn- clone-card!
  [card]
  (db/insert! Card
    (-> card
        (assoc :creator_id      api/*current-user-id*
               :collection_id   (-> populate/automagic-collection deref :id)
               :result_metadata (-> card
                                    :dataset_query
                                    card.api/result-metadata-for-query))
        (dissoc :height :position :id))))

(defn- place-row!
  [dashboard row height left right]
  (if (-> left :display (#{:bar :line}))
    (dashboard/add-dashcard! dashboard left
      {:col    0
       :row    row
       :sizeX  populate/grid-width
       :sizeY  height
       :series [right]})
    (let [width (/ populate/grid-width 2)]
      (dashboard/add-dashcard! dashboard left
        {:col   0
         :row   row
         :sizeX width
         :sizeY height})
      (dashboard/add-dashcard! dashboard right
        {:col   width
         :row   row
         :sizeX width
         :sizeY height})))
  (+ row height))

(def ^:private ^Long title-height 2)

(defn- add-col-title!
  [dashboard title col]
  (populate/add-text-card! dashboard {:text   (format "# %s" title)
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
  (let [cards     (->> dashboard dashboard->cards (mapcat unroll-multiseries))
        dashboard (db/insert! Dashboard
                    :name        (format "Comparison of %s and %s"
                                         (:name left)
                                         (:name right))
                    :description (format "Automatically generated comparison dashboard comparing segments %s and %s" (:name left) (:name right))
                    :creator_id  api/*current-user-id*
                    :parameters  [])
        ;; Binding return value to make linter happy
        _         (reduce (fn [row [left right]]
                            (place-row! dashboard row (:height left)
                                        (clone-card! left)
                                        (clone-card! right)))
                          title-height
                          (map (juxt (partial inject-segment left)
                                     (partial inject-segment right))
                               cards))]
    (add-col-title! dashboard (:name left)  0)
    (add-col-title! dashboard (:name right) (/ populate/grid-width 2))        
    dashboard))
