(ns metabase.automagic-dashboards.comparison
  (:require [clojure.string :as str]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer [->root]]
             [populate :as populate]]
            [metabase.query-processor.middleware.expand-macros :refer [merge-filter-clauses]]
            [metabase.query-processor.util :as qp.util]
            [puppetlabs.i18n.core :as i18n :refer [tru]]))

(defn- dashboard->cards
  [dashboard]
  (->> dashboard
       :ordered_cards
       (map (fn [{:keys [sizeY card col row series]}]
              (assoc card
                :series   series
                :height   sizeY
                :position (+ (* row populate/grid-width) col))))
       (sort-by :position)))

(defn- clone-card
  [card]
  (-> card
      (select-keys [:dataset_query :description :display :name :result_metadata
                    :visualization_settings])
      (assoc :creator_id    api/*current-user-id*
             :collection_id nil
             :id            (gensym))))

(defn- overlay-comparison?
  [card]
  (and (-> card :display name (#{"bar" "line"}))
       (-> card :series empty?)))

(defn- place-row
  [dashboard row left right]
  (let [height       (:height left)
        card-left    (clone-card left)
        card-right   (clone-card right)]
    (if (overlay-comparison? left)
      (update dashboard :ordered_cards conj {:col                    0
                                             :row                    row
                                             :sizeX                  populate/grid-width
                                             :sizeY                  height
                                             :card                   card-left
                                             :card_id                (:id card-left)
                                             :series                 [card-right]
                                             :visualization_settings {}
                                             :id                     (gensym)})
      (let [width (/ populate/grid-width 2)
            series-left  (map clone-card (:series left))
            series-right (map clone-card (:series right))]
        (-> dashboard
            (update :ordered_cards conj {:col                    0
                                         :row                    row
                                         :sizeX                  width
                                         :sizeY                  height
                                         :card                   card-left
                                         :card_id                (:id card-left)
                                         :series                 series-left
                                         :visualization_settings {}
                                         :id                     (gensym)})
            (update :ordered_cards conj {:col                    width
                                         :row                    row
                                         :sizeX                  width
                                         :sizeY                  height
                                         :card                   card-right
                                         :card_id                (:id card-right)
                                         :series                 series-right
                                         :visualization_settings {}
                                         :id                     (gensym)}))))))

(def ^:private ^Long ^:const title-height 2)

(defn- add-col-title
  [dashboard title col]
  (populate/add-text-card dashboard {:text   (format "# %s" title)
                                     :width  (/ populate/grid-width 2)
                                     :height title-height}
                          [0 col]))

(defn- multiseries?
  [card]
  (and (-> card :display name (= "line"))
       (-> card (qp.util/get-in-normalized [:dataset_query :query :aggregation]) count (> 1))))

(defn- unroll-multiseries
  [card]
  (if (multiseries? card)
    (for [aggregation (qp.util/get-in-normalized card [:dataset_query :query :aggregation])]
      (qp.util/assoc-in-normalized card [:dataset_query :query :aggregation] [aggregation]))
    [card]))

(defn- inject-filter
  "Inject filter clause into card."
  [{:keys [query-filter]} card]
  (-> card
      (update-in [:dataset_query :query :filter] merge-filter-clauses query-filter)
      (update :series (partial map (partial inject-filter query-filter)))))

(defn comparison-dashboard
  "Create a comparison dashboard based on dashboard `dashboard` comparing subsets of
   the dataset defined by segments `left` and `right`."
  [dashboard left right]
  (let [left  (->root left)
        right (->root right)]
    (transduce (comp (filter :display)
                     (mapcat unroll-multiseries)
                     (map (juxt (partial inject-filter left)
                                (partial inject-filter right))))
               (fn
                 ([]
                  [(let [title (tru "Comparison of {0} and {1}"
                                    (:full-name left)
                                    (:full-name right))]
                     (-> {:name              title
                          :transient_name    title
                          :transient_filters nil
                          :description       (tru "Automatically generated comparison dashboard comparing {0} and {1}"
                                                  (:full-name left)
                                                  (:full-name right))
                          :creator_id        api/*current-user-id*
                          :parameters        []}
                         (add-col-title (-> left :full-name str/capitalize) 0)
                         (add-col-title (-> right :full-name str/capitalize)
                                        (/ populate/grid-width 2))))
                   title-height])
                 ([[dashboard row]] dashboard)
                 ([[dashboard row] [left right]]
                  [(place-row dashboard row left right)
                   (+ row (:height left))]))
               (dashboard->cards dashboard))))


;; (dashboard->cards (-> (metabase.models.dashboard/Dashboard 76)
;;                       (toucan.hydrate/hydrate [:ordered_cards
;;                                                [:card :in_public_dashboard]
;;                                                :series])))

(binding [api/*current-user-id* 1]
  (->(comparison-dashboard (-> (metabase.models.dashboard/Dashboard 76)
                               (toucan.hydrate/hydrate [:ordered_cards
                                                        [:card :in_public_dashboard]
                                                        :series]))
                           (metabase.models.segment/Segment 6)
                           (metabase.models.segment/Segment 7))
     (metabase.models.dashboard/save-transient-dashboard!)
     :id))
