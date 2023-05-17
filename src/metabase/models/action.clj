(ns metabase.models.action
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.interface :as mi]
   [metabase.models.query :as query]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.models.serialization.util :as serdes.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [toucan.db :as db]
   [toucan.hydrate :refer [hydrate]]
   [toucan.models :as models]
   [toucan2.core :as t2]))

(models/defmodel QueryAction :query_action)
(models/defmodel HTTPAction :http_action)
(models/defmodel ImplicitAction :implicit_action)
(models/defmodel Action :action)

(defn type->model
  "Returns the model from an action type.
   `action-type` can be a string or a keyword."
  [action-type]
  (case action-type
    :http     HTTPAction
    :implicit ImplicitAction
    :query    QueryAction))

;;; You can read/write an Action if you can read/write its model (Card)
(doto Action
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set))

(defmethod mi/perms-objects-set Action
  [instance read-or-write]
  (mi/perms-objects-set (db/select-one Card :id (:model_id instance)) read-or-write))

(models/add-type! ::json-with-nested-parameters
  :in  (comp mi/json-in
             (fn [template]
               (u/update-if-exists template :parameters mi/normalize-parameters-list)))
  :out (comp (fn [template]
               (u/update-if-exists template :parameters (mi/catch-normalization-exceptions mi/normalize-parameters-list)))
             mi/json-out-with-keywordization))

(mi/define-simple-hydration-method model
  :model
  "Return the Card this action uses as a model."
  [{:keys [model_id]}]
  (t2/select-one Card :id model_id))

(defn- check-model-is-not-a-saved-question
  [model-id]
  (when-not (db/select-one-field :dataset Card :id model-id)
    (throw (ex-info (tru "Actions must be made with models, not cards.")
                    {:status-code 400}))))

(t2/define-before-insert Action
  [{model-id :model_id, :as action}]
  (u/prog1 action
    (check-model-is-not-a-saved-question model-id)))

(t2/define-before-update Action
  [{archived? :archived, id :id, model-id :model_id, :as changes}]
  (u/prog1 changes
    (if archived?
      (t2/delete! DashboardCard :action_id id)
      (check-model-is-not-a-saved-question model-id))))

(mi/define-methods
 Action
 {:types      (constantly {:type                   :keyword
                           :parameter_mappings     :parameters-list
                           :parameters             :parameters-list
                           :visualization_settings :visualization-settings})
  :properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})})

(def ^:private Action-subtype-IModel-impl
  "[[models/IModel]] impl for `HTTPAction`, `ImplicitAction`, and `QueryAction`"
  {:primary-key (constantly :action_id)}) ; This is ok as long as we're 1:1

(mi/define-methods
 QueryAction
 (merge
  Action-subtype-IModel-impl
  {:types (constantly {:dataset_query :json})}))

(mi/define-methods
 ImplicitAction
 Action-subtype-IModel-impl)

(mi/define-methods
 HTTPAction
 (merge Action-subtype-IModel-impl
        {:types (constantly {:template ::json-with-nested-parameters})}))

(def action-columns
  "The columns that are common to all Action types."
  [:archived :created_at :creator_id :description :entity_id :made_public_by_id :model_id :name :parameter_mappings
   :parameters :public_uuid :type :updated_at :visualization_settings])

(defn insert!
  "Inserts an Action and related type table. Returns the action id."
  [action-data]
  (db/transaction
    (let [action (db/insert! Action (select-keys action-data action-columns))
          model  (type->model (:type action))]
      (db/execute! {:insert-into (t2/table-name model)
                    :values [(-> (apply dissoc action-data action-columns)
                                 (assoc :action_id (:id action))
                                 (cond->
                                   (= (:type action) :implicit)
                                   (dissoc :database_id)
                                   (= (:type action) :http)
                                   (update :template json/encode)
                                   (= (:type action) :query)
                                   (update :dataset_query json/encode)))]})
      (:id action))))

(defn update!
  "Updates an Action and the related type table.
   Deletes the old type table row if the type has changed."
  [{:keys [id] :as action} existing-action]
  (when-let [action-row (not-empty (select-keys action action-columns))]
    (db/update! Action id action-row))
  (when-let [type-row (not-empty (cond-> (apply dissoc action :id action-columns)
                                         (= (or (:type action) (:type existing-action))
                                            :implicit)
                                         (dissoc :database_id)))]
    (let [type-row (assoc type-row :action_id id)
          existing-model (type->model (:type existing-action))]
      (if (and (:type action) (not= (:type action) (:type existing-action)))
        (let [new-model (type->model (:type action))]
          (db/delete! existing-model :action_id id)
          (db/insert! new-model (assoc type-row :action_id id)))
        (db/update! existing-model id type-row)))))

(defn- hydrate-subtype [action]
  (let [subtype (type->model (:type action))]
    (-> action
        (merge (db/select-one subtype :action_id (:id action)))
        (dissoc :action_id))))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [query-actions (db/select QueryAction :action_id [:in (map :id actions)])
          action-id->query-actions (m/index-by :action_id query-actions)]
      (for [action actions]
        (merge action (-> action :id action-id->query-actions (dissoc :action_id)))))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (db/select HTTPAction :action_id [:in (map :id actions)])
          http-actions-by-action-id (m/index-by :action_id http-actions)]
      (map (fn [action]
             (let [http-action (get http-actions-by-action-id (:id action))]
               (-> action
                   (merge
                     {:disabled false}
                     (select-keys http-action [:template :response_handle :error_handle])
                     (select-keys (:template http-action) [:parameters :parameter_mappings])))))
           actions))))

(defn- normalize-implicit-actions [actions]
  (when (seq actions)
    (let [implicit-actions (db/select ImplicitAction :action_id [:in (map :id actions)])
          implicit-actions-by-action-id (m/index-by :action_id implicit-actions)]
      (map (fn [action]
             (let [implicit-action (get implicit-actions-by-action-id (:id action))]
               (merge action
                     (select-keys implicit-action [:kind]))))
           actions))))

(defn- select-actions-without-implicit-params
  "Select Actions and fill in sub type information. Don't use this if you need implicit parameters
   for implicit actions, use [[select-action]] instead.
   `options` is passed to `db/select` `& options` arg."
  [& options]
  (let [{:keys [query http implicit]} (group-by :type (apply db/select Action options))
        query-actions                 (normalize-query-actions query)
        http-actions                  (normalize-http-actions http)
        implicit-actions              (normalize-implicit-actions implicit)]
    (sort-by :updated_at (concat query-actions http-actions implicit-actions))))

(defn unique-field-slugs?
  "Makes sure that if `coll` is indexed by `index-by`, no keys will be in conflict."
  [fields]
  (empty? (m/filter-vals #(not= % 1) (frequencies (map (comp u/slugify :name) fields)))))

(defn- implicit-action-parameters
  "Returns a map of card-id -> implicit-parameters for the given models"
  [cards]
  (let [card-by-table-id (into {}
                               (for [card cards
                                     :let [{:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
                                     :when table-id]
                                 [table-id card]))
        tables (when-let [table-ids (seq (keys card-by-table-id))]
                 (hydrate (db/select 'Table :id [:in table-ids]) :fields))]
    (into {}
          (for [table tables
                :let [fields (:fields table)]
                ;; Skip tables for have conflicting slugified columns i.e. table has "name" and "NAME" columns.
                :when (unique-field-slugs? fields)
                :let [card (get card-by-table-id (:id table))
                      exposed-fields (into #{} (keep :id) (:result_metadata card))
                      parameters (->> fields
                                      (filter #(contains? exposed-fields (:id %)))
                                      ;; remove exploded json fields and any structured field
                                      (remove (some-fn
                                               ;; exploded json fields can't be recombined in sql yet
                                               :nfc_path
                                               ;; their parents, a json field, nor things like cidr, macaddr, xml, etc
                                               (comp #(isa? % :type/Structured) :effective_type)
                                               ;; or things which we don't recognize
                                               (comp #{:type/*} :effective_type)))
                                      (map (fn [field]
                                             {:id (u/slugify (:name field))
                                              :target [:variable [:template-tag (u/slugify (:name field))]]
                                              :type (:base_type field)
                                              :required (:database_required field)
                                              :is-auto-increment (:database_is_auto_increment field)
                                              ::field-id (:id field)
                                              ::pk? (isa? (:semantic_type field) :type/PK)})))]]
            [(:id card) parameters]))))

(defn select-actions
  "Find actions with given options and generate implicit parameters for execution. Also adds the `:database_id` of the
   model for implicit actions.

   Pass in known-models to save a second Card lookup."
  [known-models & options]
  (let [actions                       (apply select-actions-without-implicit-params options)
        implicit-action-model-ids     (set (map :model_id (filter #(= :implicit (:type %)) actions)))
        implicit-action-models        (if known-models
                                        (->> known-models
                                             (filter #(contains? implicit-action-model-ids (:id %)))
                                             distinct)
                                        (when (seq implicit-action-model-ids)
                                          (db/select 'Card :id [:in implicit-action-model-ids])))
        model-id->db-id               (into {} (for [card implicit-action-models]
                                                 [(:id card) (:database_id card)]))
        model-id->implicit-parameters (when (seq implicit-action-models)
                                        (implicit-action-parameters implicit-action-models))]
    (for [{:keys [parameters] :as action} actions]
      (if (= (:type action) :implicit)
        (let [model-id        (:model_id action)
              saved-params    (m/index-by :id parameters)
              action-kind     (:kind action)
              implicit-params (cond->> (get model-id->implicit-parameters model-id)
                                :always
                                (map (fn [param] (merge param (get saved-params (:id param)))))

                                (= "row/delete" action-kind)
                                (filter ::pk?)

                                (= "row/create" action-kind)
                                (remove #(or (:is-auto-increment %)
                                             ;; non-required PKs like column with default is uuid_generate_v4()
                                             (and (::pk? %) (not (:required %)))))

                                (contains? #{"row/update" "row/delete"} action-kind)
                                (map (fn [param] (cond-> param (::pk? param) (assoc :required true))))

                                :always
                                (map #(dissoc % ::pk? ::field-id)))]
          (cond-> (assoc action :database_id (model-id->db-id (:model_id action)))
            (seq implicit-params)
            (assoc :parameters implicit-params)))
        action))))

(defn select-action
  "Selects an Action and fills in the subtype data and implicit parameters.
   `options` is passed to `db/select-one` `& options` arg."
  [& options]
  (first (apply select-actions nil options)))

(mi/define-batched-hydration-method dashcard-action
  :dashcard/action
  "Hydrates action from DashboardCards."
  [dashcards]
  (let [actions-by-id (when-let [action-ids (seq (keep :action_id dashcards))]
                        (m/index-by :id (select-actions nil :id [:in action-ids])))]
    (for [dashcard dashcards]
      (m/assoc-some dashcard :action (get actions-by-id (:action_id dashcard))))))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes.base/extract-query "Action" [_model _opts]
  (eduction (map hydrate-subtype)
            (db/select-reducible 'Action)))

(defmethod serdes.hash/identity-hash-fields Action [_action]
  [:name (serdes.hash/hydrated-hash :model "<none>") :created_at])

(defmethod serdes.base/extract-one "Action" [_model-name _opts action]
  (-> (serdes.base/extract-one-basics "Action" action)
      (update :creator_id serdes.util/export-user)
      (update :model_id serdes.util/export-fk 'Card)
      (update :type name)
      (cond-> (= (:type action) :query)
        (update :database_id serdes.util/export-fk-keyed 'Database :name))))

(defmethod serdes.base/load-xform "Action" [action]
  (-> action
      serdes.base/load-xform-basics
      (update :creator_id serdes.util/import-user)
      (update :model_id serdes.util/import-fk 'Card)
      (update :type keyword)
      (cond-> (= (:type action) "query")
        (update :database_id serdes.util/import-fk-keyed 'Database :name))))

(defmethod serdes.base/load-update! "Action" [_model-name ingested local]
  (log/tracef "Upserting Action %d: old %s new %s" (:id local) (pr-str local) (pr-str ingested))
  (update! (assoc ingested :id (:id local)) local)
  (select-action :id (:id local)))

(defmethod serdes.base/load-insert! "Action" [_model-name ingested]
  (log/tracef "Inserting Action: %s" (pr-str ingested))
  (insert! ingested))

(defmethod serdes.base/serdes-dependencies "Action" [action]
  (concat [[{:model "Card" :id (:model_id action)}]]
    (when (= (:type action) "query")
      [[{:model "Database" :id (:database_id action)}]])))

(defmethod serdes.base/storage-path "Action" [action _ctx]
  (let [{:keys [id label]} (-> action serdes.base/serdes-path last)]
    ["actions" (serdes.base/storage-leaf-file-name id label)]))

(serdes.base/register-ingestion-path!
 "Action"
  ;; ["actions" "my-action"]
 (fn [path]
   (when-let [[id slug] (and (= (first path) "actions")
                             ;; TODO: make action a directory with itself
                             ;; (apply = (take-last 2 path))
                             (serdes.base/split-leaf-file-name (last path)))]
     (cond-> {:model "Action" :id id}
       slug (assoc :label slug)
       true vector))))
