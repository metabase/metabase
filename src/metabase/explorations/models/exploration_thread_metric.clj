(ns metabase.explorations.models.exploration-thread-metric
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThreadMetric [_model] :exploration_thread_metric)

(doto :model/ExplorationThreadMetric
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ExplorationThreadMetric
  {:dimension_mappings mi/transform-json})

(def ^:private card-projection
  "Columns surfaced when hydrating `:card` on an `ExplorationThreadMetric`. Keeps the
   payload small — the FE wants metric metadata for labelling, not the dataset query
   blob — and includes `:card_schema` because `t2/select` on `:model/Card` requires
   it."
  [:id :name :description :type :display :collection_id :archived :card_schema])

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThreadMetric :card]
  [_model k join-rows]
  (mi/instances-with-hydrated-data
   join-rows k
   #(let [card-ids (into #{} (map :card_id) join-rows)]
      (when (seq card-ids)
        (into {} (map (juxt :id identity))
              (t2/select (into [:model/Card] card-projection) :id [:in card-ids]))))
   :card_id))
