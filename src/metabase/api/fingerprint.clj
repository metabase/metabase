(ns metabase.api.fingerprint
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.fingerprinting.core :as f]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [schema.core :as s]))

;; See metabase.fingerprinting.core/fingerprint for description of these settings.
(def ^:private ^:const MaxQueryCost
  (s/maybe (s/enum "cache"
                   "sample"
                   "full-scan"
                   "joins")))

(def ^:private ^:const MaxComputationCost
  (s/maybe (s/enum "linear"
                   "unbounded"
                   "yolo")))

(def ^:private ^:const Scale
  (s/maybe (s/enum "month"
                   "week"
                   "day")))

(defn- max-cost
  [query computation]
  {:query       (keyword query)
   :computation (keyword computation)})

(api/defendpoint GET "/field/:id"
  "Get fingerprint for a `Field` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Field)
       (f/fingerprint {:max-cost (max-cost max_query_cost
                                           max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/table/:id"
  "Get fingerprint for a `Tield` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Table)
       (f/fingerprint {:max-cost (max-cost max_query_cost
                                           max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/segment/:id"
  "Get fingerprint for a `Segment` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Segment)
       (f/fingerprint {:max-cost (max-cost max_query_cost
                                           max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/card/:id"
  "Get fingerprint for a `Card` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Card)
       (f/fingerprint {:max-cost (max-cost max_query_cost
                                           max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/compare/fields/:id1/:id2"
  "Get comparison fingerprints for `Field`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map (partial api/read-check Field))
       (apply f/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/compare/tables/:id1/:id2"
  "Get comparison fingerprints for `Table`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map (partial api/read-check Table))
       (apply f/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/compare/cards/:id1/:id2"
  "Get comparison fingerprints for `Card`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map (partial api/read-check Card))
       (apply f/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/compare/segments/:id1/:id2"
  "Get comparison fingerprints for `Segment`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id1 id2]
       (map (partial api/read-check Segment))
       (apply f/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       f/x-ray))

(api/defendpoint GET "/compare/segment/:sid/table/:tid"
  "Compare `Segment` with `Table`."
  [sid tid max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (f/x-ray
   (f/compare-fingerprints
    {:max-cost (max-cost max_query_cost max_computation_cost)}
    (api/read-check Segment sid)
    (api/read-check Table tid))))

(api/define-routes)
