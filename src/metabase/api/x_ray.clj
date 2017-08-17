(ns metabase.api.x-ray
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.feature-extraction.core :as fe]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [schema.core :as s]))

;; See metabase.feature-extraction.core/extract-features for description of
;; these settings.
(def ^:private MaxQueryCost
  (s/maybe (s/enum "cache"
                   "sample"
                   "full-scan"
                   "joins")))

(def ^:private MaxComputationCost
  (s/maybe (s/enum "linear"
                   "unbounded"
                   "yolo")))

;; (def ^:private Scale
;;   (s/maybe (s/enum "month"
;;                    "week"
;;                    "day")))

(defn- max-cost
  [query computation]
  {:query       (keyword query)
   :computation (keyword computation)})

(api/defendpoint GET "/field/:id"
  "Get x-ray for a `Field` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Field)
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/table/:id"
  "Get x-ray for a `Tield` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Table)
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/segment/:id"
  "Get x-ray for a `Segment` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Segment)
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/card/:id"
  "Get x-ray for a `Card` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Card)
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/fields/:id1/:id2"
  "Get comparison x-ray for `Field`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map #(api/read-check Field (Integer/parseInt %)))
       (apply fe/compare-features
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/tables/:id1/:id2"
  "Get comparison x-ray for `Table`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map #(api/read-check Table (Integer/parseInt %)))
       (apply fe/compare-features
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/tables/:id1/:id2/field/:field"
  "Get comparison x-ray for `Field` named `field` from `Table`s with ID1 and
   ID2."
  [id1 id2 field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (let [{:keys [comparison constituents]}
        (->> [id1 id2]
             (map #(api/read-check Table (Integer/parseInt %)))
             (apply fe/compare-features
                    {:max-cost (max-cost max_query_cost max_computation_cost)})
             fe/x-ray)]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

;; (api/defendpoint GET "/compare/cards/:id1/:id2"
;;   "Get comparison x-ray for `Card`s with ID1 and ID2."
;;   [id1 id2 max_query_cost max_computation_cost]
;;   {max_query_cost       MaxQueryCost
;;    max_computation_cost MaxComputationCost}
;;   (->> [id1 id2]
;;        (map (partial api/read-check Card))
;;        (apply fe/compare-features
;;               {:max-cost (max-cost max_query_cost max_computation_cost)})
;;        fe/x-ray))

(api/defendpoint GET "/compare/segments/:id1/:id2"
  "Get comparison x-ray for `Segment`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map #(api/read-check Segment (Integer/parseInt %)))
       (apply fe/compare-features
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/segments/:id1/:id2/field/:field"
  "Get comparison x-ray for `Field` named `field` from `Segment`s with
   ID1 and ID2."
  [id1 id2 field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (let [{:keys [comparison constituents]}
        (->> [id1 id2]
             (map #(api/read-check Segment (Integer/parseInt %)))
             (apply fe/compare-features
                    {:max-cost (max-cost max_query_cost max_computation_cost)})
             fe/x-ray)]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

(api/defendpoint GET "/compare/segment/:sid/table/:tid"
  "Get comparison x-ray for `Segment` and `Table`."
  [sid tid max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (fe/x-ray
   (fe/compare-features
    {:max-cost (max-cost max_query_cost max_computation_cost)}
    (api/read-check Segment sid)
    (api/read-check Table tid))))

(api/defendpoint GET "/compare/segment/:sid/table/:tid/field/:field"
  "Get comparison x-ray for `Field` named `field` from `Segment` `SID` and table
   `TID`."
  [sid tid field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (let [{:keys [comparison constituents]}
        (fe/x-ray
         (fe/compare-features
          {:max-cost (max-cost max_query_cost max_computation_cost)}
          (api/read-check Segment sid)
          (api/read-check Table tid)))]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

(api/defendpoint GET "/compare/valid-pairs"
  "Get a list of model pairs that can be compared."
  []
  [["field" "field"]
   ["segment" "segment"
    "table" "table"
    "segment" "table"]])

(api/define-routes)
