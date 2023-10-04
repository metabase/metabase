(ns metabase.automagic-dashboards.foo-dashboard-generator
  (:require [clojure.math :as math]
            [toucan2.core :as t2]))


(defmulti create-metric-chart (juxt :affinity-set :chart))

(defn proto-chart [{{metric-query :definition} :metric
                    dimensions                 :dimensions}]
  (let [{:keys [source-table]} metric-query
        id       (gensym)
        db-id    (t2/select-one-fn :db_id :model/Table source-table)
        breakout (mapv (fn [{field-id :id base-type :base_type}]
                         [:field field-id {:base-type base-type}])
                       dimensions)
        query    (assoc metric-query :breakout breakout)]
    {:description   nil
     :table_id      source-table
     :database_id   db-id
     :query_type    :query
     :dataset_query {:type :query :database db-id :query query}
     :id            id}))

(defmethod create-metric-chart [#{:type/Longitude :type/Latitude} :map]
  [{{metric-name :name} :metric :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by location" metric-name)
    :display "map"))

(defmethod create-metric-chart [#{:type/Longitude :type/Latitude} :binned-map]
  [{{metric-name :name} :metric :as metric-affinity}]
  (-> (proto-chart metric-affinity)
      (assoc
        :name (format "%s by binned location" metric-name)
        :display "map")
      (update-in
        [:dataset_query :query :breakout]
        (fn [field-specs]
          (mapv
            (fn [field-spec]
              (conj (pop field-spec) (assoc (peek field-spec) :binning {:strategy :default})))
            field-specs)))))

(defmethod create-metric-chart [#{:type/Country} :map]
  [{{metric-name :name} :metric :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by country" metric-name)
    :display "map"
    :visualization_settings {:map.type   "region"
                             :map.region "world_countries"}))

(defmethod create-metric-chart [#{:type/State} :map]
  [{{metric-name :name} :metric :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by state" metric-name)
    :display "map"
    :visualization_settings {:map.type   "region"
                             :map.region "us_states"}))

;(defmethod create-metric-chart [#{:type/ZipCode} :map]
;  [{{metric-name :name} :metric :as metric-affinity}]
;  (assoc (proto-chart metric-affinity)
;    :name (format "%s by zip code" metric-name)
;    :display "map"
;    :visualization_settings {:map.type   "region"
;                             :map.region "us_states"}))

(defmethod create-metric-chart [#{:type/Source} :bar]
  [{{metric-name :name} :metric
    [{breakout-name :name}] :dimensions
    :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by %s" metric-name breakout-name)
    :display :bar))

(defmethod create-metric-chart [#{:type/Category} :bar]
  [{{metric-name :name} :metric
    [{breakout-name :name}] :dimensions
    :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by %s" metric-name breakout-name)
    :display :bar))

(defmethod create-metric-chart [#{:type/CreationTimestamp} :line]
  [{{metric-name :name} :metric
    [{breakout-name :name}] :dimensions
    :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by %s" metric-name breakout-name)
    :display :line))

(defmethod create-metric-chart [#{:type/Quantity} :line]
  [{{metric-name :name} :metric
    [{breakout-name :name}] :dimensions
    :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by %s" metric-name breakout-name)
    :display :line))

(defmethod create-metric-chart [#{:type/Discount} :line]
  [{{metric-name :name} :metric
    [{breakout-name :name}] :dimensions
    :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name (format "%s by %s" metric-name breakout-name)
    :display :line))

;; Other types -- scalar, text (I think), table, row, scatter, area

(defmethod create-metric-chart :default
  [{{metric-name :name} :metric :as metric-affinity}]
  (assoc (proto-chart metric-affinity)
    :name metric-name
    :display "scalar"))

(defn create-metric-dashcard [metric-affinity]
  (let [{card-id :id :as card} (create-metric-chart metric-affinity)]
    {:id                     (gensym)
     :row                    0
     :col                    0
     :size_x                 8
     :size_y                 6
     :dashboard_tab_id       nil
     :card_id                card-id
     :card                   card
     :visualization_settings {}}))

(defn do-layout [cards]
  (let [n-cards  (count cards)
        row-size (-> n-cards math/sqrt math/floor int)]
    (->> (for [row (range) col (range row-size)] [row col])
         (take n-cards)
         (map (fn [card [row col]]
                (-> card
                    (assoc :row (* row 6))
                    (assoc :col (* col 8))))
              cards))))

(defn create-dashboard [{:keys [dashboard-name]} bound-affinities]
  (let [cards (->> bound-affinities
                   (mapcat (fn [{:keys [charts] :as metric-affinity}]
                             (map (fn [chart]
                                    (assoc
                                      (dissoc metric-affinity :charts)
                                      :chart chart))
                                  charts)))
                   (map create-metric-dashcard)
                   do-layout)]
    {:description        (format "An exploration of your metric %s" dashboard-name)
     :name               (format "A look at %s" dashboard-name)
     :creator_id         1
     :transient_name     (format "Here's the %s dashboard" dashboard-name)
     :param_fields       {}
     :auto_apply_filters true
     :ordered_cards      cards}))