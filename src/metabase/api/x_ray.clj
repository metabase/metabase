(ns metabase.api.x-ray
  (:refer-clojure :exclude [compare])
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.feature-extraction
             [async :as async]
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

;; See metabase.feature-extraction.core/costs for description of these settings.
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
  {:job-id (async/with-async
             [model model
              opts  {:max-cost max-cost}]
             (fe/x-ray (fe/extract-features opts model)))})

(defn- compare
  [max-cost model1 model2]
  (api/check-403 (costs/enable-xrays))
  {:job-id (async/with-async
             [model1 model1
              model2 model2
              opts   {:max-cost max-cost}]
             (fe/x-ray (fe/compare-features opts model1 model2)))})

(api/defendpoint GET "/field/:id"
  "X-ray a field."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Field id)))

(api/defendpoint GET "/table/:id"
  "X-ray a table."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Table id)))

(api/defendpoint GET "/card/:id"
  "X-ray a card."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Card id)))

(api/defendpoint GET "/metric/:id"
  "X-ray a metric."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Metric id)))

(api/defendpoint GET "/segment/:id"
  "X-ray a segment."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (x-ray (max-cost max_query_cost max_computation_cost)
         (api/read-check Segment id)))

(api/defendpoint POST "/query"
  "X-ray a query."
  [max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> query
       query/adhoc-query
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

(api/defendpoint GET "/compare/segment/:segment-id/table/:table-id"
  "Get comparison x-ray of a table and a segment."
  [segment-id table-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Segment segment-id)
           (api/read-check Table table-id)))

(api/defendpoint GET "/compare/card/:card-id/table/:table-id"
  "Get comparison x-ray of a table and a card."
  [card-id table-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Card card-id)
           (api/read-check Table table-id)))

(api/defendpoint GET "/compare/card/:card-id/segment/:segment-id"
  "Get comparison x-ray of a card and a segment."
  [card-id segment-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Card card-id)
           (api/read-check Segment segment-id)))

(api/defendpoint GET "/compare/segment/:segment-id/card/:card-id"
  "Get comparison x-ray of a card and a segment."
  [segment-id card-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Segment segment-id)
           (api/read-check Card card-id)))

(api/defendpoint GET "/compare/table/:table-id/card/:card-id"
  "Get comparison x-ray of a table and a card."
  [table-id card-id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Table table-id)
           (api/read-check Card card-id)))

(api/defendpoint POST "/compare/card/:id/query"
  "Get comparison x-ray of card and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Card id)
           (query/adhoc-query query)))

(api/defendpoint POST "/compare/table/:id/query"
  "Get comparison x-ray of table and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Table id)
           (query/adhoc-query query)))

(api/defendpoint POST "/compare/segment/:id/query"
  "Get comparison x-ray of segment and ad-hoc query."
  [id max_query_cost max_computation_cost :as {query :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (compare (max-cost max_query_cost max_computation_cost)
           (api/read-check Segment id)
           (query/adhoc-query query)))

(api/define-routes)
