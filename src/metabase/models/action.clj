(ns metabase.models.action
  (:require
   [cheshire.core :as json]
   [medley.core :as m]
   [metabase.models.card :refer [Card]]
   [metabase.models.interface :as mi]
   [metabase.models.query :as query]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; -------------------------------------------- Entity & Life Cycle ----------------------------------------------

(methodical/defmethod t2/table-name :model/Action [_model] :action)
(methodical/defmethod t2/table-name :model/QueryAction [_model] :query_action)
(methodical/defmethod t2/table-name :model/HTTPAction [_model] :http_action)
(methodical/defmethod t2/table-name :model/ImplicitAction [_model] :implicit_action)

;; Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
;; We'll keep this till we replace all the Actions symbol in our codebase.
(def Action         "Action model"         :model/Action)
(def QueryAction    "QueryAction model"    :model/QueryAction)
(def HTTPAction     "HTTPAction model"     :model/HTTPAction)
(def ImplicitAction "ImplicitAction model" :model/ImplicitAction)

(def ^:private action-sub-models [:model/QueryAction :model/HTTPAction :model/ImplicitAction])

(doto :model/Action
  (derive :metabase/model)
  ;;; You can read/write an Action if you can read/write its model (Card)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(doseq [model action-sub-models]
  (derive model :metabase/model))

(methodical/defmethod t2/primary-keys :model/QueryAction    [_model] [:action_id])
(methodical/defmethod t2/primary-keys :model/HTTPAction     [_model] [:action_id])
(methodical/defmethod t2/primary-keys :model/ImplicitAction [_model] [:action_id])

(def ^:private transform-action-visualization-settings
  {:in  mi/json-in
   :out (comp (fn [viz-settings]
                ;; the keys of :fields should be strings, not keywords
                (m/update-existing viz-settings :fields update-keys name))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/Action
  {:type                   mi/transform-keyword
   :parameter_mappings     mi/transform-parameters-list
   :parameters             mi/transform-parameters-list
   :visualization_settings transform-action-visualization-settings})

(t2/deftransforms :model/QueryAction
  ;; shouldn't this be mi/transform-metabase-query?
  {:dataset_query mi/transform-json})

(def ^:private transform-json-with-nested-parameters
  {:in  (comp mi/json-in
              (fn [template]
                (u/update-if-exists template :parameters mi/normalize-parameters-list)))
   :out (comp (fn [template]
                (u/update-if-exists template :parameters (mi/catch-normalization-exceptions mi/normalize-parameters-list)))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/HTTPAction
  {:template transform-json-with-nested-parameters})

(mi/define-simple-hydration-method model
  :model
  "Return the Card this action uses as a model."
  [{:keys [model_id]}]
  (t2/select-one Card :id model_id))

(defn- check-model-is-not-a-saved-question
  [model-id]
  (when-not (t2/select-one-fn :dataset Card :id model-id)
    (throw (ex-info (tru "Actions must be made with models, not cards.")
                    {:status-code 400}))))

(t2/define-before-insert :model/Action
  [{model-id :model_id, :as action}]
  (u/prog1 action
    (check-model-is-not-a-saved-question model-id)))

(t2/define-before-update :model/Action
  [{archived? :archived, id :id, model-id :model_id, :as changes}]
  (u/prog1 changes
    (if archived?
      (t2/delete! :model/DashboardCard :action_id id)
      (check-model-is-not-a-saved-question model-id))))

(defmethod mi/perms-objects-set :model/Action
  [instance read-or-write]
  (mi/perms-objects-set (t2/select-one Card :id (:model_id instance)) read-or-write))

(def action-columns
  "The columns that are common to all Action types."
  [:archived :created_at :creator_id :description :entity_id :made_public_by_id :model_id :name :parameter_mappings
   :parameters :public_uuid :type :updated_at :visualization_settings])

(defn type->model
  "Returns the model from an action type.
   `action-type` can be a string or a keyword."
  [action-type]
  (case action-type
    :http     :model/HTTPAction
    :implicit :model/ImplicitAction
    :query    :model/QueryAction))


;;; ------------------------------------------------ CRUD fns -----------------------------------------------------

(defn insert!
  "Inserts an Action and related type table. Returns the action id."
  [action-data]
  (t2/with-transaction [_conn]
    (let [action (first (t2/insert-returning-instances! Action (select-keys action-data action-columns)))
          model  (type->model (:type action))]
      (t2/query-one {:insert-into (t2/table-name model)
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
    (t2/update! Action id action-row))
  (when-let [type-row (not-empty (cond-> (apply dissoc action :id action-columns)
                                         (= (or (:type action) (:type existing-action))
                                            :implicit)
                                         (dissoc :database_id)))]
    (let [type-row (assoc type-row :action_id id)
          existing-model (type->model (:type existing-action))]
      (if (and (:type action) (not= (:type action) (:type existing-action)))
        (let [new-model (type->model (:type action))]
          (t2/delete! existing-model :action_id id)
          (t2/insert! new-model (assoc type-row :action_id id)))
        (t2/update! existing-model id type-row)))))

(defn- hydrate-subtype [action]
  (let [subtype (type->model (:type action))]
    (-> action
        (merge (t2/select-one subtype :action_id (:id action)))
        (dissoc :action_id))))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [query-actions (t2/select QueryAction :action_id [:in (map :id actions)])
          action-id->query-actions (m/index-by :action_id query-actions)]
      (for [action actions]
        (merge action (-> action :id action-id->query-actions (dissoc :action_id)))))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (t2/select HTTPAction :action_id [:in (map :id actions)])
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
    (let [implicit-actions (t2/select ImplicitAction :action_id [:in (map :id actions)])
          implicit-actions-by-action-id (m/index-by :action_id implicit-actions)]
      (map (fn [action]
             (let [implicit-action (get implicit-actions-by-action-id (:id action))]
               (merge action
                     (select-keys implicit-action [:kind]))))
           actions))))

(defn- select-actions-without-implicit-params
  "Select Actions and fill in sub type information. Don't use this if you need implicit parameters
   for implicit actions, use [[select-action]] instead.
   `options` is passed to `t2/select` `& options` arg."
  [& options]
  (let [{:keys [query http implicit]} (group-by :type (apply t2/select Action options))
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
                 (t2/hydrate (t2/select 'Table :id [:in table-ids]) :fields))]
    (into {}
          (for [table tables
                :let [fields (:fields table)]
                ;; Skip tables for have conflicting slugified columns i.e. table has "name" and "NAME" columns.
                :when (unique-field-slugs? fields)
                :let [card         (get card-by-table-id (:id table))
                      id->metadata (m/index-by :id (:result_metadata card))
                      parameters (->> fields
                                      ;; get display_name from metadata
                                      (keep (fn [field]
                                              (when-let [metadata (id->metadata (:id field))]
                                                (assoc field :display_name (:display_name metadata)))))
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
                                              :display-name (:display_name field)
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
                                          (t2/select 'Card :id [:in implicit-action-model-ids])))
        model-id->db-id               (into {} (for [card implicit-action-models]
                                                 [(:id card) (:database_id card)]))
        model-id->implicit-parameters (when (seq implicit-action-models)
                                        (implicit-action-parameters implicit-action-models))]
    (for [action actions]
      (if (= (:type action) :implicit)
        (let [model-id        (:model_id action)
              saved-params    (m/index-by :id (:parameters action))
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
            (-> (assoc :parameters implicit-params)
                (update-in [:visualization_settings :fields]
                           (fn [fields]
                             (let [param-ids (map :id implicit-params)
                                   fields    (->> (or fields {})
                                                  ;; remove entries that don't match params (in case of deleted columns)
                                                  (m/filter-keys (set param-ids)))]
                               ;; add default entries for params that don't have an entry
                               (reduce (fn [acc param-id]
                                         (if (contains? acc param-id)
                                           acc
                                           (assoc acc param-id {:id param-id, :hidden false})))
                                       fields
                                       param-ids)))))))
        action))))

(defn select-action
  "Selects an Action and fills in the subtype data and implicit parameters.
   `options` is passed to `t2/select-one` `& options` arg."
  [& options]
  (first (apply select-actions nil options)))

(defn- map-assoc-database-enable-actions
  "Adds a boolean field `:database-enabled-actions` to each action according to the `database-enable-actions` setting for
   the action's database."
  [actions]
  (let [action-ids                  (map :id actions)
        get-database-enable-actions (fn [{:keys [settings]}]
                                      (boolean (some-> settings
                                                       ((get-in (t2/transforms :model/Database) [:settings :out]))
                                                       :database-enable-actions)))
        id->database-enable-actions (into {}
                                          (map (juxt :id get-database-enable-actions))
                                          (t2/query {:select [:action.id :db.settings]
                                                     :from   :action
                                                     :join   [[:report_card :card] [:= :card.id :action.model_id]
                                                              [:metabase_database :db] [:= :db.id :card.database_id]]
                                                     :where  [:in :action.id action-ids]}))]
    (map (fn [action]
           (assoc action :database_enabled_actions (get id->database-enable-actions (:id action))))
         actions)))

(mi/define-batched-hydration-method dashcard-action
  :dashcard/action
  "Hydrates actions from DashboardCards. Adds a boolean field `:database-enabled-actions` to each action according to the
   `database-enable-actions` setting for the action's database."
  [dashcards]
  (let [actions-by-id (when-let [action-ids (seq (keep :action_id dashcards))]
                        (->> (select-actions nil :id [:in action-ids])
                             map-assoc-database-enable-actions
                             (m/index-by :id)))]
    (for [dashcard dashcards]
      (m/assoc-some dashcard :action (get actions-by-id (:action_id dashcard))))))

(defn dashcard->action
  "Get the action associated with a dashcard if exists, return `nil` otherwise."
  [dashcard-or-dashcard-id]
  (some->> (t2/select-one-fn :action_id :model/DashboardCard :id (u/the-id dashcard-or-dashcard-id))
           (select-action :id)))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/extract-query "Action" [_model _opts]
  (eduction (map hydrate-subtype)
            (t2/reducible-select Action)))

(defmethod serdes/hash-fields :model/Action [_action]
  [:name (serdes/hydrated-hash :model) :created_at])

(defmethod serdes/extract-one "Action" [_model-name _opts action]
  (-> (serdes/extract-one-basics "Action" action)
      (update :creator_id serdes/*export-user*)
      (update :model_id serdes/*export-fk* 'Card)
      (update :type name)
      (cond-> (= (:type action) :query)
        (update :database_id serdes/*export-fk-keyed* 'Database :name))))

(defmethod serdes/load-xform "Action" [action]
  (-> action
      serdes/load-xform-basics
      (update :creator_id serdes/*import-user*)
      (update :model_id serdes/*import-fk* 'Card)
      (update :type keyword)
      (cond-> (= (:type action) "query")
        (update :database_id serdes/*import-fk-keyed* 'Database :name))))

(defmethod serdes/ingested-model-columns "Action" [_ingested]
  (into #{} (conj action-columns :database_id :dataset_query :kind :template :response_handle :error_handle :type)))

(defmethod serdes/load-update! "Action" [_model-name ingested local]
  (log/tracef "Upserting Action %d: old %s new %s" (:id local) (pr-str local) (pr-str ingested))
  (update! (assoc ingested :id (:id local)) local)
  (select-action :id (:id local)))

(defmethod serdes/load-insert! "Action" [_model-name ingested]
  (log/tracef "Inserting Action: %s" (pr-str ingested))
  (insert! ingested))

(defmethod serdes/dependencies "Action" [action]
  (concat [[{:model "Card" :id (:model_id action)}]]
    (when (= (:type action) "query")
      [[{:model "Database" :id (:database_id action)}]])))

(defmethod serdes/storage-path "Action" [action _ctx]
  (let [{:keys [id label]} (-> action serdes/path last)]
    ["actions" (serdes/storage-leaf-file-name id label)]))
