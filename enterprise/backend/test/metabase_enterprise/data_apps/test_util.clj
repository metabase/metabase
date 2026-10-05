(ns metabase-enterprise.data-apps.test-util
  (:require
   [metabase.actions.core :as actions]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn do-with-sources!
  "Call `f` with the sources a data app copies, a venues metric and a query action that belongs to no model, and with
  what it can't copy, a venues model and an action on it, as `{:metric-id :action-id :model-id :model-action-id}`."
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
          :action-id       (actions/insert! {:name          "Rename venue"
                                             :type          :query
                                             :database_id   (mt/id)
                                             :dataset_query (lib/native-query mp "UPDATE venues SET name = {{name}}")
                                             :parameters    [{:id "name" :slug "name" :type :string/=}]})
          :model-id        model-id
          :model-action-id (actions/insert! {:name "Create venue" :type :implicit :kind :row/create
                                             :model_id model-id})}))))
