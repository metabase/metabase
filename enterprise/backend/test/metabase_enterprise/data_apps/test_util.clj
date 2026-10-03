(ns metabase-enterprise.data-apps.test-util
  (:require
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn do-with-sources!
  "Call `f` with a venues metric, a venues model, and an implicit and a query action on the model, as
  `{:metric-id :model-id :implicit-id :query-action-id}`: the sources a data app copies."
  [f]
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
    (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                :type          :metric
                                                :database_id   (mt/id)
                                                :dataset_query (lib/aggregate query (lib/count))}
                   :model/Card {model-id :id} {:name          "Venues model"
                                               :type          :model
                                               :database_id   (mt/id)
                                               :dataset_query query}]
      (f {:metric-id       metric-id
          :model-id        model-id
          :implicit-id     (actions/insert! {:name "Create venue" :type :implicit :kind :row/create
                                             :model_id model-id})
          :query-action-id (actions/insert! {:name          "Rename venue"
                                             :type          :query
                                             :model_id      model-id
                                             :database_id   (mt/id)
                                             :dataset_query (lib/native-query mp "UPDATE venues SET name = {{name}}")
                                             :parameters    [{:id "name" :slug "name" :type :string/=}]})}))))
