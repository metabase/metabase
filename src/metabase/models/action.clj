(ns metabase.models.action
  (:require [cheshire.core :as json]
            [clojure.set :as set]
            [medley.core :as m]
            [metabase.models.interface :as mi]
            [metabase.models.query :as query]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.shared.util.i18n :as i18n]
            [metabase.util :as u]
            [metabase.util.encryption :as encryption]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]
            [toucan.models :as models]))

(def ^:private ^:dynamic *data-apps-enabled*
  "Should only be rebound from tests."
  false)

(defn check-data-apps-enabled
  "Flag to short-circuit any data-apps functionality."
  []
  (when-not *data-apps-enabled*
    (throw (ex-info (i18n/tru "Data apps are not enabled.")
                    {:status-code 400}))))

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
         {:pre-insert (fn [action] (check-data-apps-enabled) action)
          :types      (constantly {:type :keyword})
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
         {:pre-insert (fn [model-action] (check-data-apps-enabled) model-action)
          :properties (constantly {:entity_id    true})
          :types      (constantly {:parameter_mappings     :parameters-list
                                   :visualization_settings :visualization-settings})}))

;;; TODO -- this doesn't seem right. [[serdes.hash/identity-hash-fields]] is used to calculate `entity_id`, so we
;;; shouldn't use it in the calculation. We can fix this later
(defmethod serdes.hash/identity-hash-fields ModelAction
  [_model-action]
  [:entity_id])

(defn insert!
  "Inserts an Action and related HTTPAction or QueryAction. Returns the action id."
  [action-data]
  (check-data-apps-enabled)
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

(defn unique-field-slugs?
  "Makes sure that if `coll` is indexed by `index-by`, no keys will be in conflict."
  [fields]
  (empty? (m/filter-vals #(not= % 1) (frequencies (map (comp u/slugify :name) fields)))))

(defn- implicit-action-parameters
  [cards]
  (let [card-id-by-table-id (into {}
                                  (for [card cards
                                        :let [{:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
                                        :when table-id]
                                    [table-id (:id card)]))
        tables (when-let [table-ids (seq (keys card-id-by-table-id))]
                 (hydrate (db/select 'Table :id [:in table-ids]) :fields))]
    (into {}
          (for [table tables
                :let [fields (:fields table)]
                ;; Skip tables for have conflicting slugified columns i.e. table has "name" and "NAME" columns.
                :when (unique-field-slugs? fields)
                :let [parameters (->> fields
                                      (map (fn [field]
                                             {:id (u/slugify (:name field))
                                              :target [:variable [:template-tag (u/slugify (:name field))]]
                                              :type (:base_type field)
                                              ::pk? (isa? (:semantic_type field) :type/PK)})))]]
            [(get card-id-by-table-id (:id table)) parameters]))))

(defn merged-model-action
  "Find model-actions given options and merge in the referenced action or generate implicit parameters for execution.
   The goal is to generally hide the existence of model-action and be able to treat this merged information as an action.

   Pass in known-models to save a second Card lookup."
  [known-models & options]
  (let [model-actions (apply db/select ModelAction {:order-by [:id]} options)
        model-action-by-model-slug (m/index-by (juxt :card_id :slug)
                                               model-actions)
        actions-by-id (when-let [action-ids (not-empty (keep :action_id model-actions))]
                        (m/index-by :id (select-actions :id [:in action-ids])))
        model-ids-with-implicit-actions (set (map :card_id (remove :action_id model-actions)))
        models-with-implicit-actions (if known-models
                                       (->> known-models
                                            (filter #(contains? model-ids-with-implicit-actions (:id %)))
                                            distinct)
                                       (when (seq model-ids-with-implicit-actions)
                                         (db/select 'Card :id [:in model-ids-with-implicit-actions])))
        parameters-by-model-id (when (seq models-with-implicit-actions)
                                 (implicit-action-parameters models-with-implicit-actions))]
    (for [model-action model-actions
          :let [model-slug [(:card_id model-action) (:slug model-action)]
                model-action (get model-action-by-model-slug model-slug)
                action (get actions-by-id (:action_id model-action))
                implicit-action (when-let [parameters (get parameters-by-model-id (:card_id model-action))]
                                  {:parameters (cond->> parameters
                                                 (not (:requires_pk model-action)) (remove #(::pk? %))
                                                 (= "delete" (:slug model-action)) (filter #(::pk? %))
                                                 :always (map #(dissoc % ::pk?)))
                                   :type "implicit"})]]
      (m/deep-merge (-> model-action
                        (select-keys [:card_id :slug :action_id :visualization_settings :parameter_mappings])
                        (set/rename-keys {:card_id :model_id}))
                    implicit-action
                    action))))

(defn dashcard-action
  "Hydrates action from DashboardCard"
  {:batched-hydrate :dashcard/action}
  [dashcards]
  (let [model-slug-by-dashcard-id (->> dashcards
                                       (keep (fn [dashcard]
                                               (when-let [slug (get-in dashcard [:visualization_settings :action_slug])]
                                                 [(:id dashcard) [(:card_id dashcard) slug]])))
                                       (into {})
                                       not-empty)
        actions (when model-slug-by-dashcard-id
                  (merged-model-action (map :card dashcards) [:card_id :slug] [:in (vals model-slug-by-dashcard-id)]))
        action-by-model-slug (m/index-by (juxt :model_id :slug) actions)]
    (for [dashcard dashcards]
      (if-let [model-slug (get model-slug-by-dashcard-id (:id dashcard))]
        (m/assoc-some dashcard :action (get action-by-model-slug model-slug))
        dashcard))))
