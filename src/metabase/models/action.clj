(ns metabase.models.action
  (:require [medley.core :as m]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel QueryAction :query_action)
(models/defmodel Action :action)

(u/strict-extend (class Action)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true})}))

(u/strict-extend (class QueryAction)
  models/IModel
  (merge models/IModelDefaults
         ;; This is ok as long as we're 1:1
         {:primary-key (constantly :action_id)}))

(defn action
  "Hydrates Action from Emitter"
  {:batched-hydrate :action}
  [emitters]
  (let [actions (->> {:select [:action.id
                               :emitter_action.emitter_id
                               :query_action.card_id
                               :action.type]
                      :from [[Action :action]]
                      ;; Will need to change if we stop being 1:1
                      :join [:emitter_action [:= :emitter_action.action_id :action.id]
                             [QueryAction :query_action] [:= :query_action.action_id :action.id]]
                      :where [:in :emitter_action.emitter_id (map :id emitters)]}
                     (db/query)
                     (db/do-post-select Action)
                     (m/index-by :id))]
    (map #(assoc % :action (get actions (:action_id %))) emitters)))
