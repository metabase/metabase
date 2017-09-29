(ns metabase.api.x-ray
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
             [segment :refer [Segment]]
             [table :refer [Table]]
             [setting :as setting]]
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
  (costs/apply-global-cost-cap
   {:query       (keyword query)
    :computation (keyword computation)}))

(def ^:private ->model
  {"field"    Field
   "segment"  Segment
   "table"    Table
   "card"     Card})

(def ^:private Model
  (apply s/enum (keys ->model)))

(api/defendpoint GET "/:model/:id"
  "Get x-ray for model of type `:model` with id `:id`."
  [id model max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model                Model}
  (api/check-403 (costs/enable-xrays))
  (let [model (api/read-check (->model model) id)]
    {:job-id (async/compute
              #(->> model
                    (fe/extract-features
                     {:max-cost (max-cost max_query_cost max_computation_cost)})
                    fe/x-ray))}))

(api/defendpoint GET "/compare/:model1/:id1/:model2/:id2"
  "Get comparison x-ray for two models of types `:model1` and `:model2` with
   ids `:id1` and `id2`."
  [model1 model2 id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model1               Model
   model2               Model}
  (api/check-403 (costs/enable-xrays))
  (let [model1 (api/read-check (->model model1) (Integer/parseInt id1))
        model2 (api/read-check (->model model2) (Integer/parseInt id2))]
    {:job-id (async/compute
              #(fe/x-ray
               (fe/compare-features
                {:max-cost (max-cost max_query_cost max_computation_cost)}
                model1
                model2)))}))

(api/defendpoint GET "/compare/:model1/:id1/:model2/:id2/field/:field"
  "Get comparison x-ray for `Field` named `field` from models of types
   `:model1` and `model2` with ids `:id1` and `:id2`."
  [model1 model2 id1 id2 field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model1               Model
   model2               Model}
  (api/check-403 (costs/enable-xrays))
  (let [model1 (api/read-check (->model model1) (Integer/parseInt id1))
        model2 (api/read-check (->model model2) (Integer/parseInt id2))]
    {:job-id (async/compute
              #(let [{:keys [comparison constituents]}
                     (fe/x-ray
                      (fe/compare-features
                       {:max-cost (max-cost max_query_cost max_computation_cost)}
                       model1
                       model2))]
                {:constituents     constituents
                 :comparison       (-> comparison (get field))
                 :top-contributors (-> comparison
                                       (get field)
                                       :top-contributors)}))}))

(api/defendpoint GET "/compare/valid-pairs"
  "Get a list of model pairs that can be compared."
  []
  [["field" "field"]
   ["segment" "segment"]
   ["table" "table"]
   ["segment" "table"]])

(api/define-routes)
