(ns metabase.api.x-ray
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
   "card"     Card
   "segments" Segment
   "tables"   Table
   "cards"    Card
   "fields"   Field})

(def ^:private Model
  (apply s/enum (keys ->model)))

(api/defendpoint GET "/:model/:id"
  "Get x-ray for model of type `:model` with id `:id`."
  [id model max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model                Model}
  (api/check-403 (costs/enable-xrays))
  (->> id
       (api/read-check (->model model))
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(defn- virtual-card
  [query]
  (->> {:dataset_query query}
       (merge (card/query->database-and-table-ids query))
       card/map->CardInstance))

(api/defendpoint POST "/query"
  "Get x-ray of a query with no associated model."
  [max_query_cost max_computation_cost :as {{:keys [database], :as query} :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost}
  (api/check-403 (costs/enable-xrays))
  (when-not (= database database/virtual-id)
    (api/read-check Database database))
  (->> query
       virtual-card
       (fe/extract-features {:max-cost (max-cost max_query_cost
                                                 max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/:models/:id1/:id2"
  "Get comparison x-ray for two models of type `:models` with ids :id1 and id2."
  [models id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   models               Model}
  (api/check-403 (costs/enable-xrays))
  (->> [id1 id2]
       (map #(api/read-check (->model models) (Integer/parseInt %)))
       (apply fe/compare-features
              {:max-cost (max-cost max_query_cost max_computation_cost)})
       fe/x-ray))

(api/defendpoint GET "/compare/:model1/:id1/model2/:id2"
  "Get comparison x-ray for two models of types `:model1` and `:model2` with
   ids `:id1` and `id2`."
  [model1 model2 id1 id2 max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model1               Model
   model2               Model}
  (api/check-403 (costs/enable-xrays))
  (fe/x-ray
   (fe/compare-features
    {:max-cost (max-cost max_query_cost max_computation_cost)}
    (api/read-check (->model model1) (Integer/parseInt id1))
    (api/read-check (->model model2) (Integer/parseInt id2)))))

(api/defendpoint GET "/compare/:model/:id1/:id2/field/:field"
  "Get comparison x-ray for `Field` named `field` from models of type `:model`
   with ids `:id1` and `:id2`."
  [model id1 id2 field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model                Model}
  (api/check-403 (costs/enable-xrays))
  (let [{:keys [comparison constituents]}
        (->> [id1 id2]
             (map #(api/read-check (->model model) (Integer/parseInt %)))
             (apply fe/compare-features
                    {:max-cost (max-cost max_query_cost max_computation_cost)})
             fe/x-ray)]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

(api/defendpoint GET "/compare/:model1/:id1/model2/:id2/field/:field"
  "Get comparison x-ray for `Field` named `field` from models of types
   `:model1` and `model2` with ids `:id1` and `:id2`."
  [model1 model2 id1 id2 field max_query_cost max_computation_cost]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model1               Model
   model2               Model}
  (api/check-403 (costs/enable-xrays))
  (let [{:keys [comparison constituents]}
        (fe/x-ray
         (fe/compare-features
          {:max-cost (max-cost max_query_cost max_computation_cost)}
          (api/read-check (->model model2) (Integer/parseInt id1))
          (api/read-check (->model model2) (Integer/parseInt id2))))]
    {:constituents     constituents
     :comparison       (-> comparison (get field))
     :top-contributors (-> comparison (get field) :top-contributors)}))

(api/defendpoint POST "/compare/:model/:id/query"
  "Get comparison x-ray for model of type `:model` with id `:id` and ad-hoc
   query."
  [model id max_query_cost max_computation_cost
   :as {{:keys [database], :as query} :body}]
  {max_query_cost       MaxQueryCost
   max_computation_cost MaxComputationCost
   model                Model}
  (api/check-403 (costs/enable-xrays))
  (when-not (= database database/virtual-id)
    (api/read-check Database database))
  (fe/x-ray
   (fe/compare-features
    {:max-cost (max-cost max_query_cost max_computation_cost)}
    (api/read-check (->model model) id)
    (virtual-card query))))

(api/defendpoint GET "/compare/valid-pairs"
  "Get a list of model pairs that can be compared."
  []
  [["field" "field"]
   ["segment" "segment"]
   ["table" "table"]
   ["segment" "table"]])

(api/define-routes)
