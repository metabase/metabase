(ns metabase.models.action
  (:require [medley.core :as m]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel QueryAction :query_action)
(models/defmodel HTTPAction :http_action)
(models/defmodel Action :action)

(u/strict-extend (class Action)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true})}))

(defn- pre-insert
  [action]
  (let [base-action (db/insert! Action (select-keys action [:type]))]
    (-> action
        (dissoc :type)
        (assoc :action_id (u/the-id base-action)))))

(defn- pre-update
  [action]
  ;; All possible sub-type columns
  (when-let [sub-type-action (not-empty (select-keys action [:card_id :name :description :template :response_handle :error_handle]))]
    (assoc sub-type-action :action_id (:id action))))

(defn- pre-delete
  [action]
  (db/simple-delete! Action :id (:action_id action))
  action)

(def ^:private Action-subtype-IModel-impl
  "[[models/IModel]] impl for `HTTPAction` and `QueryAction`"
  (merge models/IModelDefaults
         {:primary-key (constantly :action_id) ; This is ok as long as we're 1:1
          :pre-delete pre-delete
          :pre-update pre-update
          :pre-insert pre-insert}))

(u/strict-extend (class QueryAction)
  models/IModel
  Action-subtype-IModel-impl)

(u/strict-extend (class HTTPAction)
  models/IModel
  (merge Action-subtype-IModel-impl
         {:types (constantly {:template :json
                              :response_handle :json
                              :error_handle :json})}))

(defn action
  "Hydrates Action from Emitter"
  {:batched-hydrate :action}
  [emitters]
  ;; emitters apparently might actually be `[nil]` (not 100% sure why) so just make sure we're not doing anything dumb
  ;; if this is the case.
  (let [emitter-ids (filter some? (map :id emitters))
        actions     (when (seq emitter-ids)
                      (->> {:select [:emitter_action.emitter_id
                                     :query_action.card_id
                                     :http_action.template
                                     :action.type]
                            :from   [[Action :action]]
                            ;; Will need to change if we stop being 1:1
                            :join   [:emitter_action             [:= :emitter_action.action_id :action.id]
                                     [QueryAction :query_action] [:= :query_action.action_id :action.id]
                                     [HTTPAction :http_action]   [:= :http_action.action_id :action.id]]
                            :where  [:in :emitter_action.emitter_id emitter-ids]}
                           db/query
                           (db/do-post-select Action)
                           (m/index-by :emitter_id)))]
    (for [{emitter-id :id, :as emitter} emitters]
      (some-> emitter (assoc :action (get actions emitter-id))))))
