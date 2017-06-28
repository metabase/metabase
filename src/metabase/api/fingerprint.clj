(ns metabase.api.fingerprint
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [metabase.fingerprinting :as fingerprinting]
            [metabase.models.card :refer [Card]]
            [metabase.models.field :refer [Field]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [schema.core :as s]))

;; See metabase.fingerprinting/fingerprint for description of these settings.
(def ^:private ^:const MaxQueryCost
  (s/maybe (s/enum "cache"
                   "sample"
                   "full-scan"
                   "joins")))

(def ^:private ^:const MaxComputationCost
  (s/maybe (s/enum "linear"
                   "unbounded"
                   "yolo")))

(def ^:private ^:const Resolution
  (s/maybe (s/enum "month"
                   "day"
                   "raw")))

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
       (fingerprinting/fingerprint {:max-cost (max-cost max_query_cost
                                                        max_computation_cost)})))

(api/defendpoint GET "/table/:id"
  "Get fingerprint for a `Tield` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Table)
       (fingerprinting/fingerprint {:max-cost (max-cost max_query_cost
                                                        max_computation_cost)})))

(api/defendpoint GET "/segment/:id"
  "Get fingerprint for a `Segment` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Segment)
       (fingerprinting/fingerprint {:max-cost (max-cost max_query_cost
                                                        max_computation_cost)})))

(api/defendpoint GET "/card/:id"
  "Get fingerprint for a `Card` with ID."
  [id max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> id
       (api/read-check Card)
       (fingerprinting/fingerprint {:max-cost (max-cost max_query_cost
                                                        max_computation_cost)})))

(api/defendpoint GET "/fields/:id1/:id2"
  "Get a multi-field fingerprint for `Field`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost resolution]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   resolution           Resolution}
  (->> [id1 id2]
       (map (partial api/read-check Field))
       (apply fingerprinting/multifield-fingerprint
              {:max-cost   (max-cost max_query_cost max_computation_cost)
               :resolution (or (keyword resolution) :day)})))

(api/defendpoint GET "/compare/fields/:id1/:id2"
  "Get comparison fingerprints for `Field`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id2 id2]
       (map (partial api/read-check Field))
       (apply fingerprinting/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})))

(api/defendpoint GET "/compare/tables/:id1/:id2"
  "Get comparison fingerprints for `Table`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id2 id2]
       (map (partial api/read-check Table))
       (apply fingerprinting/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})))

(api/defendpoint GET "/compare/cards/:id1/:id2"
  "Get comparison fingerprints for `Card`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id2 id2]
       (map (partial api/read-check Card))
       (apply fingerprinting/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})))

(api/defendpoint GET "/compare/segments/:id1/:id2"
  "Get comparison fingerprints for `Segment`s with ID1 and ID2."
  [id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (->> [id2 id2]
       (map (partial api/read-check Segment))
       (apply fingerprinting/compare-fingerprints
              {:max-cost (max-cost max_query_cost max_computation_cost)})))

(api/define-routes)
