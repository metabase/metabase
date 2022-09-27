(ns metabase.models.action
  (:require [cheshire.core :as json]
            [medley.core :as m]
            [metabase.models.interface :as mi]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.util :as u]
            [metabase.util.encryption :as encryption]
            [toucan.db :as db]
            [toucan.models :as models]))

(models/defmodel QueryAction :query_action)
(models/defmodel HTTPAction :http_action)
(models/defmodel Action :action)
(models/defmodel ModelAction :model_action)

(models/add-type! ::json-with-nested-parameters
  :in  (comp mi/json-in
             (fn [template]
               (u/update-if-exists template :parameters mi/normalize-parameters-list)))
  :out (comp (fn [template]
               (u/update-if-exists template :parameters (mi/catch-normalization-exceptions mi/normalize-parameters-list)))
             mi/json-out-with-keywordization))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class Action)
  models/IModel
  (merge models/IModelDefaults
         {:types      (constantly {:type :keyword})
          :properties (constantly {:timestamped? true})}))

(defn- pre-update
  [action]
  ;; All possible sub-type columns
  (when-let [sub-type-action (not-empty (select-keys action [:card_id :name :description :template :response_handle :error_handle]))]
    (assoc sub-type-action :action_id (or (:id action) (:action_id action)))))

(defn- pre-delete
  [action]
  (db/simple-delete! Action :id (:action_id action))
  action)

(def ^:private Action-subtype-IModel-impl
  "[[models/IModel]] impl for `HTTPAction` and `QueryAction`"
  (merge models/IModelDefaults
         {:primary-key (constantly :action_id) ; This is ok as long as we're 1:1
          :pre-delete pre-delete
          :pre-update pre-update}))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class QueryAction)
  models/IModel
  Action-subtype-IModel-impl)

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class HTTPAction)
  models/IModel
  (merge Action-subtype-IModel-impl
         {:types (constantly {:template ::json-with-nested-parameters})}))

(u/strict-extend #_{:clj-kondo/ignore [:metabase/disallow-class-or-type-on-model]} (class ModelAction)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:entity_id    true})
          :types      (constantly {:parameter_mappings     :parameters-list
                                   :visualization_settings :visualization-settings})})

  serdes.hash/IdentityHashable
  {:identity-hash-fields [:entity_id]})

(defn insert!
  "Inserts an Action and related HTTPAction or QueryAction. Returns the action id."
  [action-data]
  (db/transaction
    (let [action (db/insert! Action {:type (:type action-data)})
          model (case (keyword (:type action))
                  :http HTTPAction
                  :query QueryAction)]
      (db/execute! {:insert-into model
                    :values [(-> action-data
                                 (dissoc :type)
                                 (u/update-if-exists :template json/encode)
                                 (assoc :action_id (:id action)))]})
      (:id action))))

(def ^:private encrypted-json-out (comp mi/json-out-with-keywordization encryption/maybe-decrypt))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [cards (->> (db/query {:select [:card.*
                                         [:db.settings :db_settings]
                                         :query_action.action_id]
                                :from [[:report_card :card]]
                                :join [:query_action [:= :query_action.card_id :card.id]
                                       [:metabase_database :db] [:= :card.database_id :db.id]]
                                :where [:= :card.is_write true]})
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
                      (select-keys card [:parameters :parameter_mappings :visualization_settings])))))
            actions))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (db/select HTTPAction :action_id [:in (map :id actions)])
          http-actions-by-action-id (m/index-by :action_id http-actions)]
      (map (fn [action]
             (let [http-action (get http-actions-by-action-id (:id action))]
               (-> action
                   (merge
                     {:disabled false
                      :parameters []
                      :parameter_mappings {}
                      :visualization_settings {}}
                     (select-keys http-action [:name :description :template :response_handle :error_handle])
                     (select-keys (:template http-action) [:parameters :parameter_mappings])))))
           actions))))

(defn select-actions
  "Select Actions and fill in sub type information.
   `options` is passed to `db/select` `& options` arg"
  [& options]
  (let [{:keys [query http]} (group-by :type (apply db/select Action options))
        query-actions (normalize-query-actions query)
        http-actions (normalize-http-actions http)]
    (sort-by :updated_at (concat query-actions http-actions))))

(defn action
  "Hydrates Action from Emitter"
  {:batched-hydrate :action}
  [emitters]
  ;; emitters apparently might actually be `[nil]` (not 100% sure why) so just make sure we're not doing anything dumb
  ;; if this is the case.
  (if-let [action-id-by-emitter-id (not-empty (into {} (map (juxt :id :action_id) (filter :id emitters))))]
    (let [actions-by-id (m/index-by :id (select-actions :id [:in (map val action-id-by-emitter-id)]))]
      (for [{emitter-id :id, :as emitter} emitters]
        (some-> emitter (assoc :action (get actions-by-id (get action-id-by-emitter-id emitter-id))))))
    emitters))

(defn cards-by-action-id
  "Hydrates action_id from Card for is_write cards"
  {:batched-hydrate :card/action-id}
  [cards]
  (if-let [card-id->action-id (not-empty (db/select-field->field
                                           :card_id :action_id
                                           'QueryAction
                                           :card_id [:in (map :id cards)]))]

    (for [card cards]
      (m/assoc-some card :action_id (get card-id->action-id (:id card))))
    cards))

(defn dashcard-action
  "Hydrates action from DashboardCard"
  {:batched-hydrate :dashcard/action}
  [dashcards]
  (if-let [action-ids (not-empty (keep :action_id dashcards))]
    (let [actions-by-id (m/index-by :id (select-actions :id [:in action-ids]))]
      (for [dashcard dashcards]
        (m/assoc-some dashcard :action (get actions-by-id (:action_id dashcard)))))
    dashcards))

(defn dashcard-model-action
  "Hydrates model-action from DashboardCard"
  {:batched-hydrate :dashcard/model-action}
  [dashcards]
  (if-let [model-slug-by-dashcard-id (->> dashcards
                                          (keep (fn [dashcard]
                                                  (when-let [slug (get-in dashcard [:visualization_settings :action_slug])]
                                                    [(:id dashcard) [(:card_id dashcard) slug]])))
                                          (into {})
                                          not-empty)]
    (let [model-actions (db/select ModelAction [:card_id :slug] [:in (vals model-slug-by-dashcard-id)])
          model-action-by-model-slug (m/index-by (juxt :card_id :slug)
                                                 model-actions)
          actions-by-id (when-let [action-ids (not-empty (keep :action_id (vals model-action-by-model-slug)))]
                          (m/index-by :id (select-actions :id [:in action-ids])))]

      (for [dashcard dashcards]
        (if-let [model-slug (get model-slug-by-dashcard-id (:id dashcard))]
          (let [model-action (get model-action-by-model-slug model-slug)
                action (get actions-by-id (:action_id model-action))
                wanted-keys [:visualization_settings :parameters :parameter_mappings :name]
                hydration-value (not-empty (m/deep-merge (select-keys model-action wanted-keys)
                                                         (select-keys action wanted-keys)))]
            (m/assoc-some dashcard :model_action hydration-value))
          dashcard)))
    dashcards))
