(ns metabase.actions.models
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.actions.actions :as actions]
   [metabase.actions.db :as actions.db]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.parameters.core :as parameters]
   [metabase.permissions.core :as perms]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.models.query :as query]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- Entity & Life Cycle ----------------------------------------------

(methodical/defmethod t2/table-name :model/Action [_model] :action)
(methodical/defmethod t2/table-name :model/QueryAction [_model] :query_action)
(methodical/defmethod t2/table-name :model/ImplicitAction [_model] :implicit_action)

(def ^:private action-sub-models [:model/QueryAction :model/ImplicitAction])

(doto :model/Action
  (derive :metabase/model)
  (derive :perms/use-parent-collection-perms)
  (derive :hook/entity-id)
  (derive :hook/timestamped?)
  (derive :hook/dependencies))

(doseq [model action-sub-models]
  (derive model :metabase/model))

(doto :model/QueryAction
  (derive :hook/search-index)
  (derive :hook/dependencies))

(derive :model/ImplicitAction :hook/dependencies)

(methodical/defmethod t2/primary-keys :model/QueryAction    [_model] [:action_id])
(methodical/defmethod t2/primary-keys :model/ImplicitAction [_model] [:action_id])

(def ^:private transform-action-visualization-settings
  {:in  mi/json-in
   :out (comp (fn [viz-settings]
                ;; the keys of :fields should be strings, not keywords
                (m/update-existing viz-settings :fields update-keys u/qualified-name))
              mi/json-out-with-keywordization)})

(def ^:private transform-action-parameters
  "Like `parameters/transform-parameters`, but normalizes against `::actions.schema/action.parameters`: an implicit
  action's parameters carry the annotations [[implicit-action-parameters]] computes them with."
  {:in  (comp mi/json-in #(lib/normalize ::actions.schema/action.parameters %))
   :out (comp (mi/catch-normalization-exceptions #(lib/normalize ::actions.schema/action.parameters %))
              mi/json-out-with-keywordization)})

(t2/deftransforms :model/Action
  {:type                   mi/transform-keyword
   :public_uuid            (mi/transform-encrypted-text "action.public_uuid")
   :parameter_mappings     parameters/transform-parameter-mappings
   :parameters             transform-action-parameters
   :visualization_settings transform-action-visualization-settings})

(t2/deftransforms :model/QueryAction
  {:dataset_query lib-be/transform-query})

(t2/deftransforms :model/ImplicitAction
  {:kind mi/transform-keyword})

(methodical/defmethod t2/batched-hydrate [:model/Action :model]
  [_model k actions]
  (mi/instances-with-hydrated-data
   actions k
   #(when-let [model-ids (seq (keep :model_id actions))]
      (actions.db/cards-by-id model-ids))
   :model_id))

(defn- implicit?
  "Whether `action` is an implicit action."
  [action]
  (= :implicit (keyword (:type action))))

(defn- check-implicit-action-model
  "Throws a 400 unless the Card with `model-id` is a model."
  [model-id]
  (when-not (= (actions.db/card-type model-id) :model)
    (throw (ex-info (tru "Actions must be made with models, not cards.")
                    {:status-code 400}))))

(defn check-implicit-actions-supported
  "Throws a 400 when `action` is implicit and its model's query does not support implicit actions."
  [{model-id :model_id, :as action}]
  (when (and (implicit? action)
             model-id
             (not (query/supports-implicit-actions? (actions.db/card-query model-id))))
    (throw (ex-info (tru "Implicit actions are not supported for models with clauses.")
                    {:status-code 400}))))

;; A data app's resource collection holds the copies of the actions the app runs, and actions without a model live in
;; the data actions namespace.
(defmethod collection/allowed-namespaces :model/Action
  [_]
  (conj collection/default-allowed-namespaces collection/data-apps-ns collection/data-actions-ns))

(def ^:private model-less-namespaces
  "The Collection namespaces an Action without a model may go in, besides the data actions root."
  #{collection/data-actions-ns collection/data-apps-ns})

(defn- collection-namespace
  "The namespace of the Collection with `collection-id` as a keyword, or nil."
  [collection-id]
  (some-> collection-id actions.db/collection-namespace keyword))

(defn- check-model-less-collection
  "Throws a 400 unless an Action without a model is in the data actions root or a data actions or data app Collection."
  [{model-id :model_id, collection-id :collection_id}]
  (when (and (nil? model-id)
             collection-id
             (not (contains? model-less-namespaces (collection-namespace collection-id))))
    (let [msg (tru "An action without a model can only go in a data actions or data app collection.")]
      (throw (ex-info msg {:status-code 400
                           :errors      {:collection_id msg}})))))

(defn- check-collection-content
  "Throws unless `action` may go in its Collection."
  [{collection-id :collection_id, :as action}]
  (collection/check-collection-namespace :model/Action collection-id)
  (collection/check-allowed-content :action collection-id)
  (check-model-less-collection action))

(defn- model-collection-error
  "The 400 for an action of a model put in a Collection other than its model's."
  []
  (ex-info (tru "A model''s action goes in the model''s collection.") {:status-code 400}))

(defn- set-model-collection
  "`action` with the `:collection_id` of its model Card; throws a 400 when it is given another Collection."
  [{model-id :model_id, collection-id :collection_id, :as action}]
  (let [model-collection-id (actions.db/card-collection-id model-id)]
    (when (and (some? collection-id) (not= collection-id model-collection-id))
      (throw (model-collection-error)))
    (assoc action :collection_id model-collection-id)))

(defn- query-card-ids
  "The IDs of the Cards the native `query` reads through card template tags."
  [query]
  (into #{}
        (keep (fn [path]
                (let [{:keys [model id]} (last path)]
                  (when (= "Card" model) id))))
        (serdes/mbql-deps true query)))

(defn- data-app-action-error
  "A 400 error for an action in a data app's collection, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defn- check-data-app-action-query
  "Throws when `query`, of an action in the Collection with `collection-id`, reads a card outside that collection
  while the collection is a data app's."
  [collection-id query]
  (when (and (some? collection-id)
             (perms/data-app-collection? collection-id))
    (let [card-ids (query-card-ids query)
          outside  (when (seq card-ids)
                     (actions.db/card-ids-outside-collection card-ids collection-id))]
      (when (seq outside)
        (throw (data-app-action-error
                (tru "An action in a data app''s collection can read only the app''s own cards, not card {0}."
                     (str/join ", " (sort outside)))))))))

(defn- check-data-app-action
  "Throws unless `action`, when it is in a data app's collection, is a query or implicit action of no model that is
  neither archived nor public and whose parameters take no values from a card."
  [{collection-id :collection_id, :as action}]
  (when (and (some? collection-id) (perms/data-app-collection? collection-id))
    (when (or (not (#{:query :implicit} (keyword (:type action)))) (:model_id action))
      (throw (data-app-action-error (tru "An action in a data app''s collection must be a query or implicit action of no model."))))
    (when (:archived action)
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t be archived."))))
    (when (:public_uuid action)
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t be made public."))))
    (when (some #(= "card" (some-> (:values_source_type %) name)) (:parameters action))
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t take a parameter''s values from a card."))))))

(defn- check-data-app-action-table
  "Throws when an implicit action in the Collection with `collection-id`, a data app's, writes to the Table with
  `table-id` while that table is not published to the Library; a load skips this, as it may publish the table later."
  [collection-id table-id]
  (when (and (some? collection-id)
             (some? table-id)
             (not mi/*deserializing?*)
             (perms/data-app-collection? collection-id)
             (not (actions.db/table-published? table-id)))
    (throw (data-app-action-error (tru "An implicit action in a data app''s collection can write only to a table published to the Library.")))))

(t2/define-before-insert :model/Action
  [{model-id :model_id, :as action}]
  (u/prog1 (cond-> (public-sharing/add-public-uuid-prefix action)
             model-id set-model-collection)
    (when (and (implicit? action) model-id)
      (check-implicit-action-model model-id))
    (check-collection-content <>)
    (check-data-app-action <>)))

(t2/define-before-update :model/Action
  [{model-id :model_id, :as action}]
  (let [changed? (fn [k] (contains? (t2/changes action) k))]
    (when (and (changed? :model_id) (not mi/*deserializing?*))
      (throw (ex-info (tru "An action''s model can''t be changed.") {:status-code 400})))
    (when (and model-id
               (changed? :collection_id)
               (not= (:collection_id action) (actions.db/card-collection-id model-id)))
      (throw (model-collection-error)))
    (u/prog1 (public-sharing/add-public-uuid-prefix-if-changed action)
      (when (and (implicit? action) model-id (changed? :type))
        (check-implicit-action-model model-id)
        (check-implicit-actions-supported action))
      (when (contains? (t2/changes <>) :collection_id)
        (check-collection-content <>))
      (when (some #(contains? (t2/changes <>) %) [:collection_id :type :archived :public_uuid :parameters])
        (check-data-app-action <>))
      (when (contains? (t2/changes <>) :collection_id)
        (check-data-app-action-query (:collection_id <>) (:dataset_query (actions.db/query-action (:id <>))))
        (when (implicit? <>)
          (check-data-app-action-table (:collection_id <>) (actions.db/implicit-action-table-id (:id <>))))))))

(defn- set-query-database
  "`query-action` with the `:database_id` of its query, when it has one, as a row copied whole may hold its query
  undecoded."
  [{query :dataset_query, :as query-action}]
  (if-let [database-id (when (map? query) (:database query))]
    (assoc query-action :database_id database-id)
    query-action))

(t2/define-before-insert :model/QueryAction
  [query-action]
  (u/prog1 (set-query-database query-action)
    (check-data-app-action-query (actions.db/action-collection-id (:action_id <>)) (:dataset_query <>))))

(t2/define-before-update :model/QueryAction
  [query-action]
  (u/prog1 (set-query-database query-action)
    (when (contains? (t2/changes query-action) :dataset_query)
      (check-data-app-action-query (actions.db/action-collection-id (:action_id <>)) (:dataset_query <>)))))

(defn- check-implicit-action-table
  "Throws a 400 unless `implicit-action` has a Table exactly when its Action has no model, as an action of a model writes
  to the table its model reads when it runs."
  [{table-id :table_id, action-id :action_id}]
  (if (actions.db/action-model-id action-id)
    (when (some? table-id)
      (throw (ex-info (tru "An action of a model writes to the model''s table, so it can''t be given one.")
                      {:status-code 400})))
    (when (nil? table-id)
      (throw (ex-info (tru "An implicit action needs a table.") {:status-code 400})))))

(defn table-action-fields
  "The fields of `table` that an implicit action without a model uses, those a new model on it returns, which leaves out
  sensitive and retired fields."
  [table]
  (remove #(#{:sensitive :retired} (keyword (:visibility_type %))) (:fields table)))

(defn check-implicit-action-table-pk
  "Throws a 400 when `action` is an implicit action without a model whose Table lacks exactly one usable primary key,
  which the API checks rather than a hook as a load can bring the table's fields after the action."
  [{model-id :model_id, table-id :table_id, :as action}]
  (when (and (implicit? action) (nil? model-id) table-id)
    (let [fields (table-action-fields (first (actions.db/tables-with-fields [table-id])))]
      (when-not (= 1 (count (filter #(isa? (:semantic_type %) :type/PK) fields)))
        (throw (ex-info (tru "An implicit action needs a table with exactly one primary key.") {:status-code 400}))))))

(defn- check-model-less-implicit-action-table
  "Throws a 400 when the Table of `implicit-action`, an action without a model, is not published to the Library while
  the action is in a data app's collection."
  [{table-id :table_id, action-id :action_id}]
  (when table-id
    (check-data-app-action-table (actions.db/action-collection-id action-id) table-id)))

(t2/define-before-update :model/ImplicitAction
  [implicit-action]
  (u/prog1 implicit-action
    (when (contains? (t2/changes implicit-action) :table_id)
      (check-implicit-action-table implicit-action)
      (check-model-less-implicit-action-table implicit-action))))

(t2/define-before-insert :model/ImplicitAction
  [implicit-action]
  (u/prog1 implicit-action
    (check-implicit-action-table implicit-action)
    (check-model-less-implicit-action-table implicit-action)))

(defn- action-database-ids
  "The ids of the Databases `action` runs against: its query's, or for an implicit action its model's or its table's."
  [{model-id :model_id, action-id :id, table-id :table_id, query :dataset_query, :as action}]
  (case (keyword (:type action))
    :implicit [(if model-id
                 (:database_id (actions.db/card-scope-columns model-id))
                 (some-> (or table-id (some-> action-id actions.db/implicit-action-table-id))
                         actions.db/table-database-id))]
    :query    [(:database query)]
    []))

(defn check-action-databases-enabled
  "Throws a 400 unless actions are enabled on every Database `action` runs against."
  [action]
  (doseq [database-id (action-database-ids action)
          :when       database-id]
    (actions/check-actions-enabled-for-database (actions.db/database database-id))))

(defn- effective-collection-id
  "The id of the Collection `action` goes in, its model's when it has one; throws a 404 when either does not exist."
  [{model-id :model_id, collection-id :collection_id}]
  (if model-id
    (:collection_id (api/check-404 (actions.db/card-scope-columns model-id)))
    (u/prog1 collection-id
      (when collection-id
        (api/check-404 (actions.db/collection-exists? collection-id))))))

(defmethod mi/perms-objects-set :model/Action
  [{model-id :model_id, collection-id :collection_id, :as action} read-or-write]
  (cond
    model-id
    ((get-method mi/perms-objects-set :perms/use-parent-collection-perms) action read-or-write)

    (and (= read-or-write :write)
         (not (remote-sync/model-editable? :model/Action (assoc action :model_id nil))))
    #{"___no-remote-sync-access"}

    (nil? collection-id)
    (perms/perms-objects-set-for-parent-collection collection/data-actions-ns nil read-or-write)

    :else
    ((get-method mi/perms-objects-set :perms/use-parent-collection-perms) action read-or-write)))

(defn- collection-writable?
  "Whether the current user can write the Collection `action` goes in."
  [{model-id :model_id, :as action}]
  (let [action (assoc action :collection_id (effective-collection-id action))]
    (if model-id
      ((get-method mi/can-create? :perms/use-parent-collection-perms) :model/Action action)
      (mi/current-user-has-full-permissions? ((get-method mi/perms-objects-set :model/Action) action :write)))))

(defmethod mi/can-write? :model/Action
  ([action]
   (and (mi/superuser?)
        (mi/current-user-has-full-permissions? :write action)))
  ([model pk]
   (and (mi/superuser?)
        (mi/current-user-has-full-permissions? :write model pk))))

(defmethod mi/can-create? :model/Action
  [_model action]
  (and (mi/superuser?)
       (collection-writable? action)))

(defmethod mi/can-update? :model/Action
  [action changes]
  (and (mi/can-write? action)
       (collection-writable? (merge action changes))))

(def ^:private action-columns
  "The columns that are common to all Action types."
  [:archived :archived_directly :collection_id :created_at :creator_id :description :entity_id :made_public_by_id :model_id :name
   :parameter_mappings :parameters :public_uuid :public_uuid_prefix :type :updated_at :visualization_settings])

;;; ------------------------------------------------ CRUD fns -----------------------------------------------------

;;; TODO (Cam 10/2/25) -- this should just be the default Toucan 2 insert behavior for an action
(mu/defn- insert*! :- ::actions.schema/id
  [action-data :- ::actions.schema/action.for-insert]
  (t2/with-transaction [_conn]
    (let [action (actions.db/insert-action! (select-keys action-data action-columns))
          row    (-> (apply dissoc action-data action-columns)
                     (assoc :action_id (:id action))
                     (cond-> (= (:type action) :implicit) (dissoc :database_id)))]
      (case (:type action)
        :query    (actions.db/insert-query-action! row)
        :implicit (actions.db/insert-implicit-action! row))
      (:id action))))

(mu/defn insert! :- ::actions.schema/id
  "Inserts an Action and related type table. Returns the action id."
  [action-data :- ::actions.schema/action.for-insert]
  (insert*! (lib/normalize ::actions.schema/action.for-insert action-data)))

(mu/defn- update*!
  [{:keys [id] :as updates} :- ::actions.schema/action.for-update
   existing-action          :- ::actions.schema/action]
  (let [updates (assoc updates :type (or (:type updates) (:type existing-action)))]
    (t2/with-transaction [_conn]
      ;; the query row first: a move into a data app's collection checks the query the action then holds
      (when-let [type-row (not-empty (cond-> (apply dissoc updates :id action-columns)
                                       (= (or (:type updates) (:type existing-action))
                                          :implicit)
                                       (dissoc :database_id)))]
        (let [type-row (assoc type-row :action_id id)]
          (if (and (:type updates) (not= (:type updates) (:type existing-action)))
            (do
              (case (:type existing-action)
                :query    (actions.db/delete-query-action! id)
                :implicit (actions.db/delete-implicit-action! id))
              (case (:type updates)
                :query    (actions.db/insert-query-action! type-row)
                :implicit (actions.db/insert-implicit-action! type-row)))
            (case (:type existing-action)
              :query    (actions.db/update-query-action! id type-row)
              :implicit (actions.db/update-implicit-action! id type-row)))))
      (when-let [action-row (not-empty (select-keys updates action-columns))]
        (actions.db/update-action! id action-row))
      (when (and (:archived updates) (not (:archived existing-action)))
        (actions.db/delete-dashcards-for-action! id))
      (when-let [collection-id (and (contains? updates :collection_id)
                                    (not= (:collection_id updates) (:collection_id existing-action))
                                    (:collection_id updates))]
        (api/check-400 (actions.db/unarchived-collection-exists? collection-id)))
      (collection/check-for-remote-sync-update (t2/instance :model/Action existing-action)))))

(mu/defn update!
  "Updates an Action and the related type table.
   Deletes the old type table row if the type has changed."
  [updates         :- ::actions.schema/action.for-update
   existing-action :- ::actions.schema/action]
  (let [updates (merge (select-keys existing-action [:type]) updates)] ; in case the updates do not include it.
    (update*! (lib/normalize ::actions.schema/action.for-update updates) existing-action)))

(defn- normalize-query-actions [actions]
  (when (seq actions)
    (let [query-actions (actions.db/query-actions (map :id actions))
          action-id->query-actions (m/index-by :action_id query-actions)]
      (for [action actions]
        (merge action (-> action :id action-id->query-actions (dissoc :action_id)))))))

(defn- normalize-implicit-actions [actions]
  (when (seq actions)
    (let [implicit-actions (actions.db/implicit-actions (map :id actions))
          implicit-actions-by-action-id (m/index-by :action_id implicit-actions)]
      (map (fn [action]
             (let [implicit-action (get implicit-actions-by-action-id (:id action))]
               (merge action
                      (select-keys implicit-action [:kind :table_id]))))
           actions))))

(defn- select-actions-matching-options
  "Interprets the fixed set of kv-arg shapes [[select-action]]/[[select-actions]] callers use (also a bare id, Toucan's
   primary-key shorthand), and returns the matching Actions."
  [options]
  (if (and (= 1 (count options)) (not (keyword? (first options))))
    (actions.db/actions-with-id (first options))
    (let [opts (apply hash-map options)
          {:keys [id entity_id archived]} opts]
      (cond
        (contains? opts :id)        (if (false? archived)
                                      (actions.db/unarchived-action-with-id id)
                                      (actions.db/actions-with-id id))
        (contains? opts :entity_id) (actions.db/action-with-entity-id entity_id)
        :else                       (throw (ex-info "Unsupported Action query options" {:options options}))))))

(defn- normalize-actions-by-type
  "Groups `actions` by `:type` and fills in each subtype's sub type information."
  [actions]
  (let [{:keys [query implicit]} (group-by :type actions)
        query-actions            (normalize-query-actions query)
        implicit-actions         (normalize-implicit-actions implicit)]
    (sort-by :updated_at (concat query-actions implicit-actions))))

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

(defn- field-implicit-parameter
  "The parameter of an implicit action for writing `field`."
  [field]
  {:id                (u/slugify (:name field))
   :display-name      (:display_name field)
   :target            [:variable [:template-tag (u/slugify (:name field))]]
   :type              (condp #(isa? %2 %1) (:base_type field)
                        :type/Number   :number
                        :type/Temporal :date
                        :type/Boolean  :boolean
                        :text)
   :required          (:database_required field)
   :is-auto-increment (:database_is_auto_increment field)
   ::field-id         (:id field)
   ::pk?              (isa? (:semantic_type field) :type/PK)})

(def ^:private unwritable-field?
  "Whether an implicit action can't write `field`: an unfolded JSON field, a structured or JSON parent field, or a field of
  an unknown type."
  (some-fn :nfc_path
           (comp #(isa? % :type/Structured) :effective_type)
           (comp #{:type/*} :effective_type)))

(defn- model-implicit-parameters
  "Returns a map of model Card id -> implicit parameters: the writable fields of each model's source Table that the model
  returns, under the model's display names, skipping a Table whose column names clash once slugified."
  [cards]
  (let [card-id->table-id (into {}
                                (for [card  cards
                                      :let  [{:keys [table-id]} (query/query->database-and-table-ids (:dataset_query card))]
                                      :when table-id]
                                  [(:id card) table-id]))
        table-by-id        (when (seq card-id->table-id)
                             (m/index-by :id (actions.db/tables-with-fields (vec (distinct (vals card-id->table-id))))))]
    (into {}
          (for [card  cards
                :let  [fields (:fields (get table-by-id (get card-id->table-id (:id card))))]
                :when (and (seq fields) (unique-field-slugs? fields))
                :let  [id->metadata (m/index-by :id (:result_metadata card))]]
            [(:id card)
             (->> fields
                  (keep (fn [field]
                          (when-let [metadata (id->metadata (:id field))]
                            (assoc field :display_name (:display_name metadata)))))
                  (remove unwritable-field?)
                  (map field-implicit-parameter))]))))

(defn- table-implicit-parameters
  "Returns a map of Table id -> implicit parameters: the writable fields a new model on each Table returns, skipping a
  Table whose column names among them clash once slugified."
  [table-ids]
  (into {}
        (for [table (when (seq table-ids) (actions.db/tables-with-fields (vec table-ids)))
              :let  [fields (table-action-fields table)]
              :when (unique-field-slugs? fields)]
          [(:id table)
           (->> fields
                (remove unwritable-field?)
                (map field-implicit-parameter))])))

(defn- select-actions-implicit-params [action implicit-parameters]
  (let [saved-params (m/index-by :id (:parameters action))
        action-kind  (keyword (:kind action))]
    (cond->> implicit-parameters
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

(defn- enrich-implicit-action [action database-id implicit-parameters field-id->viz-field]
  (let [implicit-params (select-actions-implicit-params action implicit-parameters)]
    (cond-> (assoc action :database_id database-id)
      (seq implicit-params)
      (-> (assoc :parameters implicit-params)
          (update-in [:visualization_settings :fields] enrich-viz-settings-fields implicit-params field-id->viz-field)))))

(defn- enrich-actions-with-implicit-params
  "Fills in implicit parameters for `actions` and adds the `:database_id` of implicit actions: an action of a model takes
  them from its model, an action without one from its Table."
  [actions]
  (let [implicit         (filter #(= :implicit (:type %)) actions)
        models           (when-let [model-ids (not-empty (into #{} (keep :model_id) implicit))]
                           (actions.db/cards model-ids))
        table-ids        (into #{} (comp (remove :model_id) (keep :table_id)) implicit)
        model-id->params (model-implicit-parameters models)
        table-id->params (table-implicit-parameters table-ids)
        model-id->db-id  (into {} (map (juxt :id :database_id)) models)
        table-id->db-id  (into {} (map (juxt :id :db_id)) (when (seq table-ids) (actions.db/tables (vec table-ids))))
        field-id->viz    (implicit-parameters->viz-fields (concat (vals model-id->params) (vals table-id->params)))]
    (for [{model-id :model_id, table-id :table_id, :as action} actions]
      (if (= :implicit (:type action))
        (if model-id
          (enrich-implicit-action action (model-id->db-id model-id) (model-id->params model-id) field-id->viz)
          (enrich-implicit-action action (table-id->db-id table-id) (table-id->params table-id) field-id->viz))
        action))))

(mu/defn select-actions :- [:maybe [:sequential ::actions.schema/action]]
  "Find actions with given options and generate implicit parameters for execution. Also adds the `:database_id` of the
   table for implicit actions."
  [& options :- [:* [:or :nil :keyword ms/PositiveInt :string :boolean]]]
  (enrich-actions-with-implicit-params (apply select-actions-without-implicit-params options)))

(mu/defn select-actions-for-ids :- [:maybe [:sequential ::actions.schema/action]]
  "Find the Actions whose `:id` is in `action-ids`, filling in implicit parameters as [[select-actions]] does."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (enrich-actions-with-implicit-params (normalize-actions-by-type (actions.db/actions-with-ids action-ids))))

(mu/defn select-action :- [:maybe ::actions.schema/action]
  "Selects an Action and fills in the subtype data and implicit parameters.
   `options` is interpreted by [[select-actions-matching-options]]."
  [& options :- [:* [:or :nil :keyword ms/PositiveInt :string :boolean]]]
  ;; TODO -- it's dumb that we're selecting all matches rather than a single one above, limiting like this should
  ;; never be done server-side. I don't have time to fix this right now. -- Cam
  (first (apply select-actions options)))

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
           (assoc action :database_enabled_actions (get id->database-enable-actions (:id action) false)))
         actions)))

(methodical/defmethod t2.hydrate/batched-hydrate [:model/DashboardCard :dashcard/action]
  "Hydrates DashboardCard actions, with `:can_write` and `:database_enabled_actions` from the action's database."
  [_model _k dashcards]
  (let [actions-by-id
        (when-let [action-ids (seq (keep :action_id dashcards))]
          (as-> (select-actions-for-ids action-ids) actions
            (map-assoc-database-enable-actions actions)
            (t2/hydrate actions :can_write)
            (m/index-by :id actions)))]
    (for [dashcard dashcards
          :let [action-id (:action_id dashcard)
                action    (get actions-by-id action-id)]]
      (m/assoc-some dashcard :action action))))

(defn dashcard->action
  "Get the unarchived action associated with a dashcard if exists, return `nil` otherwise."
  [dashcard-or-dashcard-id]
  (when-let [action-id (actions.db/dashcard-action-id (u/the-id dashcard-or-dashcard-id))]
    (select-action :id action-id :archived false)))

;;; ------------------------------------------------ Serialization ---------------------------------------------------

(defmethod serdes/generate-path "QueryAction" [_ _] nil)
(defmethod serdes/make-spec "QueryAction" [_model-name _opts]
  {:copy      []
   :skip      [;; this is a temporary column to power v57 => v56 rollbacks, and we can remove it in v58.
               :legacy_query]
   :transform {:action_id     (serdes/parent-ref)
               :database_id   (serdes/fk :model/Database)
               :dataset_query {:export serdes/export-mbql :import serdes/import-mbql}}})

(defmethod serdes/generate-path "ImplicitAction" [_ _] nil)
(defmethod serdes/make-spec "ImplicitAction" [_model-name _opts]
  {:copy      [:kind]
   :transform {:action_id (serdes/parent-ref)
               :table_id  (serdes/fk :model/Table)}})

(defmethod serdes/make-spec "Action" [_model-name opts]
  {:copy      [:archived :archived_directly :description :entity_id :name :public_uuid]
   :skip      [;; always re-derived from public_uuid on import
               :public_uuid_prefix]
   :transform {:type                   (serdes/kw)
               :creator_id             (serdes/fk :model/User)
               :made_public_by_id      (serdes/fk :model/User)
               :collection_id          (serdes/fk :model/Collection)
               :model_id               (serdes/fk :model/Card)
               :query                  (serdes/nested :model/QueryAction :action_id (merge {:sort-by :name} opts))
               :implicit               (serdes/nested :model/ImplicitAction :action_id (merge {:sort-by :name} opts))
               :parameters             {:export serdes/export-parameters :import serdes/import-parameters}
               :parameter_mappings     {:export serdes/export-parameter-mappings
                                        :import serdes/import-parameter-mappings}
               :visualization_settings {:export serdes/export-visualization-settings
                                        :import serdes/import-visualization-settings}}
   :defaults  {:archived false, :archived_directly false}})

(defmethod serdes/storage-path "Action" [{:keys [model_id collection_id] :as action} ctx]
  (if (and (nil? model_id)
           (or (nil? collection_id)
               (= collection/data-actions-ns
                  (some-> (actions.db/collection-namespace-with-entity-id collection_id) keyword))))
    (serdes/storage-default-collection-path action ctx (serdes/collection-namespace-folder collection/data-actions-ns))
    (serdes/storage-default-collection-path action ctx)))

(defmethod serdes/load-one! "Action" [ingested maybe-local]
  (when-not (= "http" (some-> (:type ingested) name))
    (serdes/default-load-one! ingested maybe-local)))

(defmethod serdes/deserialization-dependencies "Action" [action]
  (set
   (concat
    (when-let [collection-id (:collection_id action)]
      [[{:model "Collection" :id collection-id}]])
    (when-let [model-id (:model_id action)]
      [[{:model "Card" :id model-id}]])
    (when (= (:type action) "query")
      (serdes/mbql-deps false (:dataset_query (first (:query action))))))))

(defmethod serdes/serialization-dependencies "Action" [_model-name {:keys [id collection_id model_id type]}]
  ;; Serialization runs on the raw entity, whose query lives in the `query_action` child table (`:type` is a keyword
  ;; here, not a string), so the query is fetched rather than read from a nested `:query` key.
  (set
   (concat
    (when collection_id [[{:model "Collection" :id collection_id}]])
    (when model_id [[{:model "Card" :id model_id}]])
    (when (= type :query)
      (when-let [{:keys [database_id dataset_query]} (actions.db/query-action id)]
        (concat
         (when database_id [[{:model "Database" :id database_id}]])
         (serdes/mbql-deps true dataset_query)))))))

(defmethod serdes/descendants "Action" [_model-name id _opts]
  (when-let [model-id (actions.db/action-model-id id)]
    {["Card" model-id] {"Action" id}}))

;;;; ------------------------------------------------- Search ----------------------------------------------------------

(search/define-spec "action"
  {:model        :model/Action
   :attrs        {:archived       true
                  :collection-id  true
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
   :where        [:and [:= :collection.namespace nil] [:not= :this.model_id nil]]
   :joins        {:model        [:model/Card [:= :model.id :this.model_id]]
                  :query_action [:model/QueryAction [:= :query_action.action_id :this.id]]
                  :collection   [:model/Collection [:= :collection.id :this.collection_id]]}})
