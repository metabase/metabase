(ns metabase.actions.dependencies
  "The functions of the dependencies spec of an Action."
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]))

(set! *warn-on-reflection* true)

(defn- action-query
  "The normalized query of the query `action`, or nil."
  [action]
  (when (= :query (:type action))
    (lib-be/normalize-query (:dataset_query action))))

(defn hydrate
  "The Actions `actions` with the query of each query action and the table of each implicit one, and the dependencies
  of their native queries."
  [actions]
  (let [action-ids (mapv :id actions)
        queries    (when (seq action-ids) (actions.db/query-action-queries action-ids))
        table-ids  (when (seq action-ids) (actions.db/implicit-action-table-ids action-ids))]
    (dependencies/with-native-dependencies
      (mapv (fn [{:keys [id] :as action}]
              (cond-> action
                (contains? queries id)   (assoc :dataset_query (queries id))
                (contains? table-ids id) (assoc :table_id (table-ids id))))
            actions)
      action-query)))

(defn dependencies
  "The dependencies of the hydrated `action`: the model or table of an implicit action, or what the query of a query
  action reads."
  [{action-type :type, model-id :model_id, table-id :table_id, :as action}]
  (case action-type
    :implicit (if model-id
                {:card #{model-id}}
                {:table (if table-id #{table-id} #{})})
    :query    (dependencies/query-dependencies action (action-query action))))
