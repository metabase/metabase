(ns metabase.automagic-dashboards.comparison
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :refer [->root]]
             [populate :as populate]]
            [metabase.models.metric :refer [Metric]]
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
  (and (-> card :display qp.util/normalize-token (#{:bar :line}))
       (-> card :series empty?)))

(defn- inject-filter
  "Inject filter clause into card."
  [{:keys [query-filter]} card]
  (-> card
      (update-in [:dataset_query :query :filter] merge-filter-clauses query-filter)
      (update :series (partial map (partial inject-filter query-filter)))))

(defn- multiseries?
  [card]
  (or (-> card :series not-empty)
      (-> card (qp.util/get-in-normalized [:dataset_query :query :aggregation]) count (> 1))
      (-> card (qp.util/get-in-normalized [:dataset_query :query :breakout]) count (> 1))))

(defn- comparison-row
  [dashboard row left right card]
  (let [height                   (:height card)
        card-left                (->> card (inject-filter left) clone-card)
        card-right               (->> card (inject-filter right) clone-card)
        [color-left color-right] (->> [left right]
                                      (map #(qp.util/get-in-normalized % [:dataset_query :query :filter]) )
                                      populate/map-to-colors)]
    (if (overlay-comparison? card)
      (let [card   (-> card-left
                       (assoc-in [:visualization_settings :graph.colors] [color-left color-right])
                       (update :name #(format "%s (%s)" % (:full-name left))))
            series (-> card-right
                       (update :name #(format "%s (%s)" % (:full-name right)))
                       vector)]
        (update dashboard :ordered_cards conj {:col                    0
                                               :row                    row
                                               :sizeX                  populate/grid-width
                                               :sizeY                  height
                                               :card                   card
                                               :card_id                (:id card)
                                               :series                 series
                                               :visualization_settings {}
                                               :id                     (gensym)}))
      (let [width        (/ populate/grid-width 2)
            series-left  (map clone-card (:series card-left))
            series-right (map clone-card (:series card-right))
            card-left    (cond-> card-left
                           (not (multiseries? card-left))
                           (assoc-in [:visualization_settings :graph.colors] [color-left]))
            card-right   (cond-> card-right
                           (not (multiseries? card-right))
                           (assoc-in [:visualization_settings :graph.colors] [color-right]))]
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
  (populate/add-text-card dashboard {:text                   (format "# %s" title)
                                     :width                  (/ populate/grid-width 2)
                                     :height                 title-height
                                     :visualization-settings {:dashcard.background false
                                                              :text.align_vertical :bottom}}
                          [0 col]))

(defn- series-labels
  [card]
  (get-in card [:visualization_settings :graph.series_labels]
          (for [[op & args] (qp.util/get-in-normalized card [:dataset_query :query :aggregation])]
            (if (= (qp.util/normalize-token op) :metric)
              (-> args first Metric :name)
              (-> op name str/capitalize)))))

(defn- unroll-multiseries
  [card]
  (if (and (multiseries? card)
           (-> card :display qp.util/normalize-token (= :line)))
    (for [[aggregation label] (map vector
                                   (qp.util/get-in-normalized card [:dataset_query :query :aggregation])
                                   (series-labels card))]
      (-> card
          (qp.util/assoc-in-normalized [:dataset_query :query :aggregation] [aggregation])
          (assoc :name label)
          (m/dissoc-in [:visualization_settings :graph.series_labels])))
    [card]))

(defn comparison-dashboard
  "Create a comparison dashboard based on dashboard `dashboard` comparing subsets of
   the dataset defined by segments `left` and `right`."
  [dashboard left right]
  (let [left  (->root left)
        right (->root right)]
    (transduce (comp (filter :display)
                     (mapcat unroll-multiseries))
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
                         (add-col-title (:full-name left) 0)
                         (add-col-title (:full-name right) (/ populate/grid-width 2))))
                   title-height])
                 ([[dashboard row]] dashboard)
                 ([[dashboard row] card]
                  [(comparison-row dashboard row left right card)
                   (+ row (:height card))]))
               (dashboard->cards dashboard))))
