(ns metabase.actions.models
  (:require
   [medley.core :as m]
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.core :as parameters]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.models.query :as query]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- Entity & Life Cycle ----------------------------------------------

(methodical/defmethod t2/table-name :model/Action [_model] :action)
(methodical/defmethod t2/table-name :model/QueryAction [_model] :query_action)
(methodical/defmethod t2/table-name :model/HTTPAction [_model] :http_action)
(methodical/defmethod t2/table-name :model/ImplicitAction [_model] :implicit_action)

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

(derive :model/QueryAction :hook/search-index)

(methodical/defmethod t2/primary-keys :model/QueryAction    [_model] [:action_id])
(methodical/defmethod t2/primary-keys :model/HTTPAction     [_model] [:action_id])
(methodical/defmethod t2/primary-keys :model/ImplicitAction [_model] [:action_id])

(def ^:private transform-action-visualization-settings
  {:in  mi/json-in
   :out (comp (fn [viz-settings]
                ;; the keys of :fields should be strings, not keywords
                (m/update-existing viz-settings :fields update-keys u/qualified-name))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/Action
  {:type                   mi/transform-keyword
   :public_uuid            (mi/transform-encrypted-text "action.public_uuid")
   :parameter_mappings     parameters/transform-parameter-mappings
   :parameters             parameters/transform-parameters
   :visualization_settings transform-action-visualization-settings})

(t2/deftransforms :model/QueryAction
  {:dataset_query lib-be/transform-query})

(t2/deftransforms :model/ImplicitAction
  {:kind mi/transform-keyword})

(def ^:private transform-json-with-nested-parameters
  {:in  (comp mi/json-in
              (fn [template]
                (u/update-if-exists template :parameters parameters/normalize-parameters)))
   :out (comp (fn [template]
                (u/update-if-exists template :parameters (mi/catch-normalization-exceptions parameters/normalize-parameters)))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/HTTPAction
  {:template transform-json-with-nested-parameters})

(methodical/defmethod t2/batched-hydrate [:model/Action :model]
  [_model k actions]
  (mi/instances-with-hydrated-data
   actions k
   #(actions.db/cards-by-id (map :model_id actions))
   :model_id))

(defn- check-model-is-not-a-saved-question
  [model-id]
  (when-not (= (actions.db/card-type model-id) :model)
    (throw (ex-info (tru "Actions must be made with models, not cards.")
                    {:status-code 400}))))

(t2/define-before-insert :model/Action
  [{model-id :model_id, :as action}]
  (u/prog1 (public-sharing/add-public-uuid-prefix action)
    (check-model-is-not-a-saved-question model-id)))

(t2/define-before-update :model/Action
  [{archived? :archived, id :id, model-id :model_id, :as changes}]
  (u/prog1 (public-sharing/add-public-uuid-prefix-if-changed changes)
    (if archived?
      (actions.db/delete-dashcards-for-action! id)
      (check-model-is-not-a-saved-question model-id))))

(mu/defmethod mi/perms-objects-set :model/Action :- [:set {:min 1} :string]
  [instance      :- [:map
                     [:model_id pos-int?]]
   read-or-write :- [:enum :read :write]]
  (mi/perms-objects-set (actions.db/card (:model_id instance)) read-or-write))

(def ^:private action-columns
  "The columns that are common to all Action types."
  [:archived :created_at :creator_id :description :entity_id :made_public_by_id :model_id :name :parameter_mappings
   :parameters :public_uuid :public_uuid_prefix :type :updated_at :visualization_settings])

;;; ------------------------------------------------ CRUD fns -----------------------------------------------------

(defn- query->database-id
  [query]
  (when (map? query)
    (:database query)))

(defn- derive-query-action-database-id
  "For `:query` actions, `:database_id` is wholly derived from the database the query executes against: it is
  redundant metadata that must track `(:database dataset_query)`, exactly as a Card's `database_id` tracks its query
  ([[metabase.queries.models.card/populate-query-fields]]).

  On update the query may not be part of the change, so `fallback-query` (the existing action's query) supplies the
  database so that a `:database_id`-only change can't repoint it. A no-op for non-query actions and when no query is
  available."
  ([action-row]
   (derive-query-action-database-id action-row nil))
  ([{action-type :type, query :dataset_query, :as action-row} fallback-query]
   (if-let [query-db-id (and (= action-type :query)
                             (or (query->database-id query)
                                 (query->database-id fallback-query)))]
     (assoc action-row :database_id query-db-id)
     action-row)))

;;; TODO (Cam 10/2/25) -- this should just be the default Toucan 2 insert behavior for an action
(mu/defn- insert*! :- ::actions.schema/id
  [action-data :- ::actions.schema/action.for-insert]
  (let [action-data (derive-query-action-database-id action-data)]
    (t2/with-transaction [_conn]
      (let [action (actions.db/insert-action! (select-keys action-data action-columns))
            row    (-> (apply dissoc action-data action-columns)
                       (assoc :action_id (:id action))
                       (cond-> (= (:type action) :implicit) (dissoc :database_id)))]
        (case (:type action)
          :query    (actions.db/insert-query-action! row)
          :http     (actions.db/insert-http-action! row)
          :implicit (actions.db/insert-implicit-action! row))
        (:id action)))))

(mu/defn insert! :- ::actions.schema/id
  "Inserts an Action and related type table. Returns the action id."
  [action-data :- :map]
  (insert*! (lib/normalize ::actions.schema/action.for-insert action-data)))

(mu/defn- update*!
  [{:keys [id] :as updates} :- ::actions.schema/action.for-update
   existing-action          :- ::actions.schema/action]
  (let [updates (derive-query-action-database-id
                 (assoc updates :type (or (:type updates) (:type existing-action)))
                 (:dataset_query existing-action))]
    (t2/with-transaction [_conn]
      (when-let [action-row (not-empty (select-keys updates action-columns))]
        (actions.db/update-action! id action-row))
      (when-let [type-row (not-empty (cond-> (apply dissoc updates :id action-columns)
                                       (= (or (:type updates) (:type existing-action))
                                          :implicit)
                                       (dissoc :database_id)))]
        (let [type-row (assoc type-row :action_id id)]
          (if (and (:type updates) (not= (:type updates) (:type existing-action)))
            (do
              (case (:type existing-action)
                :query    (actions.db/delete-query-action! id)
                :http     (actions.db/delete-http-action! id)
                :implicit (actions.db/delete-implicit-action! id))
              (case (:type updates)
                :query    (actions.db/insert-query-action! type-row)
                :http     (actions.db/insert-http-action! type-row)
                :implicit (actions.db/insert-implicit-action! type-row)))
            (case (:type existing-action)
              :query    (actions.db/update-query-action! id type-row)
              :http     (actions.db/update-http-action! id type-row)
              :implicit (actions.db/update-implicit-action! id type-row))))))))

(mu/defn update!
  "Updates an Action and the related type table.
   Deletes the old type table row if the type has changed."
  [updates         :- [:map
                       [:id ::actions.schema/id]]
   existing-action :- ::actions.schema/action]
  (let [updates (merge (select-keys existing-action [:type]) updates)] ; in case the updates do not include it.
    (update*! (lib/normalize ::actions.schema/action.for-update updates) existing-action)))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [query-actions (actions.db/query-actions (map :id actions))
          action-id->query-actions (m/index-by :action_id query-actions)]
      (for [action actions]
        (merge action (-> action :id action-id->query-actions (dissoc :action_id)))))))

(defn- normalize-http-actions [actions]
  (when (seq actions)
    (let [http-actions (actions.db/http-actions (map :id actions))
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
    (let [implicit-actions (actions.db/implicit-actions (map :id actions))
          implicit-actions-by-action-id (m/index-by :action_id implicit-actions)]
      (map (fn [action]
             (let [implicit-action (get implicit-actions-by-action-id (:id action))]
               (merge action
                      (select-keys implicit-action [:kind]))))
           actions))))

(defn- select-actions-matching-options
  "Interprets the fixed set of kv-arg shapes [[select-action]]/[[select-actions]] callers use (also a bare id, Toucan's
   primary-key shorthand), and returns the matching Actions."
  [options]
  (if (and (= 1 (count options)) (not (keyword? (first options))))
    (actions.db/actions-with-id (first options))
    (let [opts (apply hash-map options)
          {:keys [id entity_id model_id type archived]} opts]
      (cond
        (contains? opts :id)        (if (false? archived)
                                      (actions.db/unarchived-action-with-id id)
                                      (actions.db/actions-with-id id))
        (contains? opts :entity_id) (actions.db/action-with-entity-id entity_id)
        (and (contains? opts :model_id) (contains? opts :type))
        (actions.db/unarchived-non-http-actions-for-model model_id)
        (contains? opts :type)      (actions.db/actions-of-type type)
        :else                       (throw (ex-info "Unsupported Action query options" {:options options}))))))

(defn- normalize-actions-by-type
  "Groups `actions` by `:type` and fills in each subtype's sub type information."
  [actions]
  (let [{:keys [query http implicit]} (group-by :type actions)
        query-actions                 (normalize-query-actions query)
        http-actions                  (normalize-http-actions http)
        implicit-actions              (normalize-implicit-actions implicit)]
    (sort-by :updated_at (concat query-actions http-actions implicit-actions))))

(defn- select-actions-without-implicit-params
  "Select Actions and fill in sub type information. Don't use this if you need implicit parameters
   for implicit actions, use [[select-action]] instead.
   `options` is interpreted by [[select-actions-matching-options]]."
  [& options]
  (normalize-actions-by-type (select-actions-matching-options options)))

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
                 (t2/hydrate (actions.db/tables table-ids) :fields))]
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
                                              ;; TODO (Cam 8/12/25) -- Field base type is NOT a valid parameter types!
                                              ;; See [[metabase.lib.schema.parameter/types]].
                                              :type (let [base-type (:base_type field)]
                                                      (condp #(isa? %2 %1) base-type
                                                        :type/Number   :number
                                                        :type/Temporal :date
                                                        :type/Boolean  :boolean
                                                        :text))
                                              :required (:database_required field)
                                              :is-auto-increment (:database_is_auto_increment field)
                                              ::field-id (:id field)
                                              ::pk? (isa? (:semantic_type field) :type/PK)})))]]
            [(:id card) parameters]))))

(defn- select-actions-implicit-params [action model-id->implicit-parameters]
  (let [model-id     (:model_id action)
        saved-params (m/index-by :id (:parameters action))
        action-kind  (keyword (:kind action))]
    (cond->> (get model-id->implicit-parameters model-id)
      :always
      (map (fn [param]
             (let [saved-param  (saved-params (:id param))
                   ;; we ignore the saved type, to allow schema changes (type changes) to be
                   ;; reflected in the field presentation
                   ;; this also fixes #39101 and avoids us making awkward changes to
                   ;; :parameter transforms for QueryActions.
                   saved-param' (dissoc saved-param :type)]
               (merge param saved-param'))))

      (= action-kind :row/delete)
      (filter ::pk?)

      (= action-kind :row/create)
      (remove #(or (:is-auto-increment %)
                   ;; non-required PKs like column with default is uuid_generate_v4()
                   (and (::pk? %) (not (:required %)))))

      (contains? #{:row/update :row/delete} action-kind)
      (map (fn [param] (cond-> param (::pk? param) (assoc :required true)))))))

(defn- implicit-parameters->viz-fields [implicit-parameters]
  (let [field-ids (into #{}
                        (comp cat
                              (keep ::field-id))
                        implicit-parameters)]
    (when (seq field-ids)
      (into {}
            (map (juxt :id (fn [field]
                             (merge
                              (select-keys field [:base_type :display_name :description])
                              {:title       (:display_name field)
                               :placeholder (:display_name field)
                               ;; these "illegal" camelCase keys are for viz
                               ;; settings purposes, and that's what the FE uses.
                               ;; See
                               ;; https://metaboat.slack.com/archives/C0645JP1W81/p1759981400217489?thread_ts=1759289751.539169&cid=C0645JP1W81
                               :fieldType   (if (isa? (:base_type field) :type/Number) :number :string)
                               :inputType   (condp #(isa? %2 %1) (:base_type field)
                                              :type/Number   :number
                                              :type/DateTime :datetime
                                              :type/Time     :time
                                              :type/Temporal :date
                                              :type/Boolean  :boolean
                                              :string)}))))
            (actions.db/fields-for-parameters field-ids)))))

(defn- enrich-viz-settings-fields [viz-fields implicit-params field-id->viz-field]
  (let [param-ids          (map :id implicit-params)
        param-id->order    (zipmap param-ids (range))
        param-id->required (into {} (map (juxt :id :required)) implicit-params)
        viz-fields         (->> (or viz-fields {})
                                ;; remove entries that don't match params (in case of deleted
                                ;; columns)
                                (m/filter-keys (set param-ids)))
        ;; add default entries for params that don't have an entry
        viz-fields         (reduce (fn [acc param-id]
                                     (if (contains? acc param-id)
                                       acc
                                       (assoc acc param-id {:id param-id, :hidden false})))
                                   viz-fields
                                   param-ids)
        param-id->field-id (into {} (map (juxt :id ::field-id)) implicit-params)]
    (update-vals viz-fields (fn [{param-id :id, :as viz-field}]
                              (let [field-id (get param-id->field-id param-id)]
                                (merge viz-field
                                       (get field-id->viz-field field-id)
                                       {:order    (get param-id->order param-id)
                                        :required (get param-id->required param-id)}))))))

(defn- enrich-action [action model-id->db-id model-id->implicit-parameters field-id->viz-field]
  (case (:type action)
    :implicit
    (let [implicit-params (select-actions-implicit-params action model-id->implicit-parameters)]
      (cond-> (assoc action :database_id (model-id->db-id (:model_id action)))
        (seq implicit-params)
        (-> (assoc :parameters implicit-params)
            (update-in [:visualization_settings :fields] enrich-viz-settings-fields implicit-params field-id->viz-field))))
    (:query :http)
    action))

(defn- enrich-actions-with-implicit-params
  "Fills in implicit parameters for `actions` and adds the `:database_id` of the model for implicit actions.

   Pass in known-models to save a second Card lookup."
  [known-models actions]
  (let [implicit-action-model-ids     (set (map :model_id (filter #(= :implicit (:type %)) actions)))
        implicit-action-models        (if known-models
                                        (->> known-models
                                             (filter #(contains? implicit-action-model-ids (:id %)))
                                             distinct)
                                        (when (seq implicit-action-model-ids)
                                          (actions.db/cards implicit-action-model-ids)))
        model-id->db-id               (into {} (for [card implicit-action-models]
                                                 [(:id card) (:database_id card)]))
        model-id->implicit-parameters (when (seq implicit-action-models)
                                        (implicit-action-parameters implicit-action-models))
        field-id->viz-field           (implicit-parameters->viz-fields (vals model-id->implicit-parameters))]
    (for [action actions]
      (enrich-action action model-id->db-id model-id->implicit-parameters field-id->viz-field))))

(mu/defn select-actions :- [:maybe [:sequential ::actions.schema/action]]
  "Find actions with given options and generate implicit parameters for execution. Also adds the `:database_id` of the
   model for implicit actions.

   Pass in known-models to save a second Card lookup."
  [known-models & options]
  (enrich-actions-with-implicit-params known-models (apply select-actions-without-implicit-params options)))

(mu/defn select-actions-for-ids :- [:maybe [:sequential ::actions.schema/action]]
  "Find the Actions whose `:id` is in `action-ids`, filling in implicit parameters as [[select-actions]] does.

   Pass in known-models to save a second Card lookup."
  [known-models action-ids]
  (enrich-actions-with-implicit-params known-models (normalize-actions-by-type (actions.db/actions-with-ids action-ids))))

(mu/defn select-actions-for-models :- [:maybe [:sequential ::actions.schema/action]]
  "Find the unarchived Actions whose `:model_id` is in `model-ids`, filling in implicit parameters as
   [[select-actions]] does.

   Pass in known-models to save a second Card lookup."
  [known-models model-ids]
  (enrich-actions-with-implicit-params known-models (normalize-actions-by-type (actions.db/unarchived-actions-for-models model-ids))))

(mu/defn select-actions-non-http-for-models :- [:maybe [:sequential ::actions.schema/action]]
  "Find the unarchived, non-HTTP Actions whose `:model_id` is in `model-ids`, filling in implicit parameters as
   [[select-actions]] does.

   Pass in known-models to save a second Card lookup."
  [known-models model-ids]
  (enrich-actions-with-implicit-params known-models (normalize-actions-by-type (actions.db/unarchived-non-http-actions-for-models model-ids))))

(mu/defn select-action :- [:maybe ::actions.schema/action]
  "Selects an Action and fills in the subtype data and implicit parameters.
   `options` is interpreted by [[select-actions-matching-options]]."
  [& options]
  ;; TODO -- it's dumb that we're selecting all matches rather than a single one above, limiting like this should
  ;; never be done server-side. I don't have time to fix this right now. -- Cam
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
                                          (actions.db/action-database-settings action-ids))]
    (map (fn [action]
           (assoc action :database_enabled_actions (get id->database-enable-actions (:id action))))
         actions)))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/DashboardCard :dashcard/action]
  "Hydrates actions from DashboardCards. Adds a boolean field `:database-enabled-actions` to each action according to
  the\n `database-enable-actions` setting for the action's database."
  [_model _k dashcards]
  (let [actions-by-id
        (when-let [action-ids (seq (keep :action_id dashcards))]
          (->> (select-actions-for-ids nil action-ids)
               map-assoc-database-enable-actions
               (m/index-by :id)))]
    (for [dashcard dashcards
          :let [action-id (:action_id dashcard)
                action    (get actions-by-id action-id)]]
      (m/assoc-some dashcard :action action))))

(defn dashcard->action
  "Get the action associated with a dashcard if exists, return `nil` otherwise."
  [dashcard-or-dashcard-id]
  (some->> (actions.db/dashcard-action-id (u/the-id dashcard-or-dashcard-id))
           (select-action :id)))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/generate-path "QueryAction" [_ _] nil)
(defmethod serdes/make-spec "QueryAction" [_model-name _opts]
  {:copy      []
   :skip      [;; this is a temporary column to power v57 => v56 rollbacks, and we can remove it in v58.
               :legacy_query]
   :transform {:action_id     (serdes/parent-ref)
               :database_id   (serdes/fk :model/Database)
               :dataset_query {:export serdes/export-mbql :import serdes/import-mbql}}})

(defmethod serdes/generate-path "HTTPAction" [_ _] nil)
(defmethod serdes/make-spec "HTTPAction" [_model-name _opts]
  {:copy      [:error_handle :response_handle :template]
   :transform {:action_id (serdes/parent-ref)}})

(defmethod serdes/generate-path "ImplicitAction" [_ _] nil)
(defmethod serdes/make-spec "ImplicitAction" [_model-name _opts]
  {:copy      [:kind]
   :transform {:action_id (serdes/parent-ref)}})

(defmethod serdes/make-spec "Action" [_model-name opts]
  {:copy      [:archived :description :entity_id :name :public_uuid]
   :skip      [;; always re-derived from public_uuid on import
               :public_uuid_prefix]
   :transform {:created_at             (serdes/date)
               :type                   (serdes/kw)
               :creator_id             (serdes/fk :model/User)
               :made_public_by_id      (serdes/fk :model/User)
               :model_id               (serdes/fk :model/Card)
               :query                  (serdes/nested :model/QueryAction :action_id (merge {:sort-by (juxt :name :created_at)} opts))
               :http                   (serdes/nested :model/HTTPAction :action_id (merge {:sort-by (juxt :name :created_at)} opts))
               :implicit               (serdes/nested :model/ImplicitAction :action_id (merge {:sort-by (juxt :name :created_at)} opts))
               :parameters             {:export serdes/export-parameters :import serdes/import-parameters}
               :parameter_mappings     {:export serdes/export-parameter-mappings
                                        :import serdes/import-parameter-mappings}
               :visualization_settings {:export serdes/export-visualization-settings
                                        :import serdes/import-visualization-settings}}
   :defaults  {:archived false}})

(defmethod serdes/deserialization-dependencies "Action" [action]
  (set
   (concat
    ;; other stuff is implicitly referenced through a Card
    [[{:model "Card" :id (:model_id action)}]]
    ;; this method is called on ingested data before transformation, and so here it always will be a string
    (when (= (:type action) "query")
      (let [{:keys [database_id dataset_query]} (first (:query action))]
        (concat
         [[{:model "Database" :id database_id}]]
         (serdes/mbql-deps false dataset_query)))))))

(defmethod serdes/serialization-dependencies "Action" [_model-name {:keys [id model_id type]}]
  ;; Serialization runs on the raw entity, whose query lives in the `query_action` child table (`:type` is a keyword
  ;; here, not a string), so the query is fetched rather than read from a nested `:query` key.
  (set
   (concat
    (when model_id [[{:model "Card" :id model_id}]])
    (when (= type :query)
      (when-let [{:keys [database_id dataset_query]} (actions.db/query-action id)]
        (concat
         (when database_id [[{:model "Database" :id database_id}]])
         (serdes/mbql-deps true dataset_query)))))))

(defmethod serdes/storage-path "Action" [action _ctx]
  [{:label "actions"} {:label (:name action) :key (:entity_id action)}])

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "action"
  {:model        :model/Action
   :attrs        {:archived       true
                  :collection-id  :model.collection_id
                  :creator-id     true
                  :database-id    :query_action.database_id
                  :native-query   :query_action.dataset_query
                  ;; workaround for actions not having revisions (yet)
                  :last-edited-at :updated_at
                  :created-at     true
                  :updated-at     true}
   :search-terms [:name :description]
   :render-terms {:model-id   :model.id
                  :model-name :model.name}
   :where        [:= :collection.namespace nil]
   :joins        {:model        [:model/Card [:= :model.id :this.model_id]]
                  :query_action [:model/QueryAction [:= :query_action.action_id :this.id]]
                  :collection   [:model/Collection [:= :collection.id :model.collection_id]]}})
