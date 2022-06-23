(ns metabase.models.action
  (:require [medley.core :as m]
            [metabase.models.interface :as mi]
            [metabase.util :as u]
            [metabase.util.encryption :as encryption]
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

(def ^:private encrypted-json-out (comp mi/json-out-with-keywordization encryption/maybe-decrypt))

(defn- normalize-query-actions [database actions]
  (when (seq actions)
    (let [cards (->> (db/query {:select [:card.*
                                         [:db.settings :db_settings]
                                         :query_action.action_id]
                                :from [[:report_card :card]]
                                :join [:query_action [:= :query_action.card_id :card.id]
                                       [:metabase_database :db] [:= :card.database_id :db.id]]
                                :where [:and
                                        [:= :card.is_write true]
                                        (when database
                                          [:= :card.database_id database])]})
                     (map (fn [card]
                            (let [disabled (or (:archived card)
                                               (-> card
                                                   (:db_settings)
                                                   encrypted-json-out
                                                   :database-enable-actions
                                                   boolean
                                                   not))]
                              (-> card
                                  (assoc ::disabled disabled)
                                  (dissoc :db_settings)))))
                     (db/do-post-select 'Card))
          cards-by-action-id (m/index-by :action_id cards)]
      (keep (fn [action]
              (let [{card-name :name :keys [description] :as card} (get cards-by-action-id (:id action))]
                (-> action
                    (merge
                      {:name card-name
                       :description description
                       :disabled (::disabled card)
                       :card (dissoc card ::disabled)}
                      (select-keys card [:parameters :parameter_mappings])))))
            actions))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (db/select HTTPAction :action_id [:in (map :id actions)])
          http-actions-by-action-id (m/index-by :action_id http-actions)]
      (map (fn [action]
             (let [http-action (get http-actions-by-action-id (:id action))]
               (-> action
                   (merge
                     {:disabled false}
                     (select-keys http-action [:name :description :template])
                     (select-keys (:template http-action) [:parameters :parameter_mappings])))))
           actions))))

(defn select-actions
  "Select Actions and fill in sub type information.
   `options` is passed to `db/select` `& options` arg"
  [database & options]
  (let [{:keys [query http]} (group-by :type (apply db/select Action options))
        query-actions (normalize-query-actions database query)
        http-actions (normalize-http-actions http)]
    (sort-by :updated_at (concat query-actions http-actions))))

(defn action
  "Hydrates Action from Emitter"
  {:batched-hydrate :action}
  [emitters]
  ;; emitters apparently might actually be `[nil]` (not 100% sure why) so just make sure we're not doing anything dumb
  ;; if this is the case.
  (if-let [emitter-ids (seq (filter some? (map :id emitters)))]
    (let [emitter-actions (db/select 'EmitterAction :emitter_id [:in emitter-ids])
          action-id-by-emitter-id (into {} (map (juxt :emitter_id :action_id) emitter-actions))
          actions (m/index-by :id (select-actions nil :id [:in (map :action_id emitter-actions)]))]
      (for [{emitter-id :id, :as emitter} emitters]
        (some-> emitter (assoc :action (get actions (get action-id-by-emitter-id emitter-id))))))
    emitters))
