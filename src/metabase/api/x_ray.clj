(ns metabase.api.x-ray
  (:refer-clojure :exclude [compare])
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.feature-extraction
             [core :as fe]
             [costs :as costs]]
            [metabase.models
             [card :refer [Card] :as card]
             [database :refer [Database] :as database]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [query :as query]
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

(defn- max-cost
  [query computation]
  (costs/apply-global-cost-cap {:query       (keyword query)
                                :computation (keyword computation)}))

(defn- x-ray
  [max-cost model]
  (api/check-403 (costs/enable-xrays))
  (fe/x-ray (fe/extract-features {:max-cost max-cost} model)))

(defn- compare
  [max-cost model1 model2]
  (api/check-403 (costs/enable-xrays))
  (fe/x-ray (fe/compare-features {:max-cost max-cost} model1 model2)))

(defn- compare-filtered-field
  [max-cost model1 model2 field]
  (let [{:keys [comparison constituents]} (compare max-cost model1 model2)]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

(api/defendpoint GET "/field/:id"
  "Get x-ray of field."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Field id)))

(api/defendpoint GET "/table/:id"
  "Get x-ray of table."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Table id)))

(api/defendpoint GET "/card/:id"
  "Get x-ray pf card."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Card id)))

(api/defendpoint GET "/segment/:id"
  "Get x-ray of segment."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Segment id)))

(defn- adhoc-query
  [{:keys [database], :as query}]
  (when-not (= database database/virtual-id)
    (api/read-check Database database))
  (->> {:dataset_query query}
       (merge (card/query->database-and-table-ids query))
       query/map->QueryInstance))

(api/defendpoint POST "/query"
  "Get x-ray for query."
  [max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> query
       adhoc-query
       (x-ray (max-cost max_query_cost max_computation_cost))))

(api/defendpoint GET "/compare/tables/:table1-id/:table2-id"
  "Get comparison x-ray of two tables."
  [table1-id table2-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Table table1-id)
           (api/read-check Table table2-id)))

(api/defendpoint GET "/compare/segments/:segment1-id/:segment2-id"
  "Get comparison x-ray of two segments."
  [segment1-id segment2-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Segment segment1-id)
           (api/read-check Segment segment2-id)))

(api/defendpoint GET "/compare/fields/:field1-id/:field2-id"
  "Get comparison x-ray of two fields."
  [field1-id field2-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Field field1-id)
           (api/read-check Field field2-id)))

(api/defendpoint GET "/compare/cards/:card1-id/:card2-id"
  "Get comparison x-ray of two cards."
  [card1-id card2-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Card card1-id)
           (api/read-check Card card2-id)))

(api/defendpoint GET "/compare/table/:table-id/segment/:segment-id"
  "Get comparison x-ray of a table and a segment."
  [table-id segment-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Table table-id)
           (api/read-check Segment segment-id)))

(api/defendpoint GET "/compare/segments/:segment1-id/:segment2-id/field/:field"
  "Get comparison x-ray of field named `field` in segments with IDs
   `segment1-id` and `segment2-id`."
  [segment1-id segment2-id field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare-filtered-field (max-cost max_query_cost max_computation_cost)
                          (api/read-check Segment segment1-id)
                          (api/read-check Segment segment2-id)
                          field))

(api/defendpoint GET "/compare/table/:table-id/segment/:segment-id/field/:field"
  "Get comparison x-ray for field named `field` in table with ID
   `table-id` and segment with ID `segment-id`."
  [table-id segment-id field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare-filtered-field (max-cost max_query_cost max_computation_cost)
                          (api/read-check Table table-id)
                          (api/read-check Segment segment-id)
                          field))

(api/defendpoint POST "/compare/table/:table-id/segment/:segment-id/field/:field"
  "Get comparison x-ray for field named `field` in table with ID
   `table-id` and segment with ID `segment-id`."
  [table-id segment-id field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare-filtered-field (max-cost max_query_cost max_computation_cost)
                          (api/read-check Table table-id)
                          (api/read-check Segment segment-id)
                          field))

(api/defendpoint POST "/compare/card/:id/query"
  "Get comparison x-ray of card and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Card id)
           (adhoc-query query)))

(api/defendpoint POST "/compare/table/:id/query"
  "Get comparison x-ray of table and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Table id)
           (adhoc-query query)))

(api/defendpoint POST "/compare/segment/:id/query"
  "Get comparison x-ray of segment and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Segment id)
           (adhoc-query query)))

(api/defendpoint GET "/compare/valid-pairs"
  "Get a list of model pairs that can be compared."
  []
  [["field" "field"]
   ["segment" "segment"]
   ["table" "table"]
   ["segment" "table"]])

(api/define-routes)
