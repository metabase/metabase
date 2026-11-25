(ns metabase.actions.models
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.actions.actions :as actions]
   [metabase.actions.collection-items :as actions.collection-items]
   [metabase.actions.db :as actions.db]
   [metabase.actions.dependencies :as actions.dependencies]
   [metabase.actions.schema :as actions.schema]
   [metabase.actions.serialization :as actions.serialization]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.parameters.core :as parameters]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.public-sharing.core :as public-sharing]
   [metabase.queries.models.query :as query]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.hydrate :as t2.hydrate])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)
;;; ----------------------------------------------------- Setup ------------------------------------------------------

(methodical/defmethod t2/table-name :model/Action [_model] :action)
(methodical/defmethod t2/table-name :model/QueryAction [_model] :query_action)
(methodical/defmethod t2/table-name :model/ImplicitAction [_model] :implicit_action)

(def ^:private action-sub-models [:model/QueryAction :model/ImplicitAction])

(doto :model/Action
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(doseq [model action-sub-models]
  (derive model :metabase/model))

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
;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- implicit?
  "Whether `action` is an implicit action."
  [action]
  (= :implicit (keyword (:type action))))

(defn- check-model-card
  "Throws a 400 unless `card`, the Card an implicit action is made on, is a model."
  [card]
  (when-not (= :model (some-> (:type card) keyword))
    (throw (ex-info (tru "Actions must be made with models, not cards.")
                    {:status-code 400}))))

(defn- check-query-supports-implicit-actions
  "Throws a 400 unless `query`, the query of the model of an implicit action, supports implicit actions."
  [query]
  (when-not (query/supports-implicit-actions? query)
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
  "The namespace of `collection`, the row of the Collection an Action is in, as a keyword, or nil."
  [collection]
  (some-> collection :namespace keyword))

(defn- check-model-less-collection
  "Throws a 400 unless an Action without a model is in the data actions root or a data actions or data app Collection,
  `collection-namespace` being the namespace of its Collection."
  [{model-id :model_id, collection-id :collection_id} collection-namespace]
  (when (and (nil? model-id)
             collection-id
             (not (contains? model-less-namespaces collection-namespace)))
    (let [msg (tru "An action without a model can only go in a data actions or data app collection.")]
      (throw (ex-info msg {:status-code 400
                           :errors      {:collection_id msg}})))))

(defn- check-collection-content
  "Throws unless `action` may go in `collection`, the row of its Collection, nil for none."
  [action collection]
  (when collection
    (collection/check-collection-namespace :model/Action collection)
    (collection/check-allowed-content :action collection)
    (collection/check-collection-not-archived (:archived action) collection))
  (check-model-less-collection action (collection-namespace collection)))

(defn- model-collection-error
  "The 400 for an action of a model put in a Collection other than its model's."
  []
  (ex-info (tru "A model''s action goes in the model''s collection.") {:status-code 400}))

(defn- set-model-collection
  "`action` with the `:collection_id` of `model-card`, its model; throws a 400 when it is given another Collection."
  [{collection-id :collection_id, :as action} model-card]
  (let [model-collection (:collection_id model-card)]
    (when (and (some? collection-id) (not= collection-id model-collection))
      (throw (model-collection-error)))
    (assoc action :collection_id model-collection)))

(defn- data-app-action-error
  "A 400 error for an action in a data app's collection, with `message`."
  [message]
  (ex-info message {:status-code 400}))

(defn- check-data-app-action
  "Throws unless `action`, when it is in a data app's collection, is an implicit action on a table, of no model, that is
  neither archived nor public and whose parameters take no values from a card; `collection-namespace` is the namespace
  of its Collection."
  [{collection-id :collection_id, :as action} collection-namespace]
  (when (and (some? collection-id) (= collection/data-apps-ns collection-namespace))
    (when (or (not= :implicit (keyword (:type action))) (:model_id action))
      (throw (data-app-action-error (tru "An action in a data app''s collection must be an implicit action on a table."))))
    (when (:archived action)
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t be archived."))))
    (when (:public_uuid action)
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t be made public."))))
    (when (some #(= "card" (some-> (:values_source_type %) name)) (:parameters action))
      (throw (data-app-action-error (tru "An action in a data app''s collection can''t take a parameter''s values from a card."))))))

(t2/define-before-insert :model/Action
  [action]
  (public-sharing/add-public-uuid-prefix action))

(t2/define-before-update :model/Action
  [action]
  (let [changes (t2/changes action)]
    (cond-> (public-sharing/add-public-uuid-prefix-if-changed action)
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (mi/archived-directly-clause :model/Action changes)))))

(defn- set-query-database
  "`query-action` with the `:database_id` its query names, when the query names one."
  [{query :dataset_query, :as query-action}]
  (if-let [database-id (when (map? query) (:database query))]
    (assoc query-action :database_id database-id)
    query-action))

(defn- check-details-type
  "Throws a 400 unless `action`, the Action of the details row, is of `action-type`."
  [action action-type]
  (when-not (= action-type (some-> action :type keyword))
    (throw (ex-info (tru "The details of an action have to match its type.") {:status-code 400}))))

(t2/define-before-insert :model/QueryAction
  [query-action]
  (set-query-database query-action))

(t2/define-before-update :model/QueryAction
  [query-action]
  (let [changes (t2/changes query-action)]
    (when (and (contains? changes :database_id) (not (contains? changes :dataset_query)))
      (throw (ex-info (tru "The database of a query action follows its query; change the query instead.") {:status-code 400})))
    (cond-> query-action
      (contains? changes :dataset_query) set-query-database)))

(defn- check-implicit-action-table
  "Throws a 400 unless `implicit-action` has a Table exactly when `action`, its Action, has no model, as an action of a
  model writes to the table its model reads when it runs."
  [{table-id :table_id} action]
  (if (:model_id action)
    (when (some? table-id)
      (throw (ex-info (tru "An action of a model writes to the model''s table, so it can''t be given one.")
                      {:status-code 400})))
    (when (nil? table-id)
      (throw (ex-info (tru "An implicit action needs a table.") {:status-code 400})))))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- model-less-root?
  "Whether `action` has neither a model nor a Collection, which puts it in the root of the data actions namespace."
  [{model-id :model_id, collection-id :collection_id}]
  (and (nil? model-id) (nil? collection-id)))

(defn- collection-writable-fn
  "A function from one of `actions` to whether the current user can write the Collection it goes in: its own or its
  model's, the default root for an Action of a model outside one, and otherwise the data actions root, whose Actions
  remote sync keeps read-only on a read-only instance, with the models and Collections of `actions` read once, when
  first asked, and a missing one answered with a 404."
  [actions]
  (let [loaded       (delay
                       (let [model-ids   (into [] (comp (keep :model_id) (distinct)) actions)
                             models      (if (seq model-ids) (actions.db/card-collection-ids model-ids) {})
                             ids         (into [] (comp (keep #(if-let [model-id (:model_id %)]
                                                                 (get models model-id)
                                                                 (:collection_id %)))
                                                        (distinct))
                                               actions)
                             collections (if (seq ids) (actions.db/collections-by-id ids) {})]
                         {:models      models
                          :collections collections
                          :writable    (into #{} (comp (filter mi/can-write?) (map :id))
                                             (t2/hydrate (vec (vals collections)) :can_write))}))
        default-root (delay (collection/can-write-collection-or-root? nil {:root-namespace nil}))
        actions-root (delay (and (collection/can-write-collection-or-root? nil {:root-namespace collection/data-actions-ns})
                                 (not (remote-sync/read-only?))))]
    (fn [{model-id :model_id, own-collection-id :collection_id}]
      (let [{:keys [models collections writable]} @loaded
            collection-id (if model-id
                            (do (api/check-404 (contains? models model-id))
                                (get models model-id))
                            own-collection-id)]
        (when collection-id
          (api/check-404 (contains? collections collection-id)))
        (cond
          collection-id (contains? writable collection-id)
          model-id      @default-root
          :else         @actions-root)))))

(defn- collection-writable?
  "Whether the current user can write the Collection `action` goes in, as [[collection-writable-fn]] answers."
  [action]
  ((collection-writable-fn [action]) action))

(defn- check-can-read-keys
  "Throws unless `action` has the columns its `:can_read` and `:can_write` hydrations read."
  [action]
  (api/check-500 (contains? action :collection_id) "No :collection_id is set for an Action.")
  (api/check-500 (contains? action :model_id) "No :model_id is set for an Action."))

(methodical/defmethod t2/batched-hydrate [:model/Action :can_read]
  "Whether the current user reads each of `actions`, as the content of its Collection, or of the data actions root for
  an Action with neither a model nor a Collection."
  [_model _k actions]
  (run! #(when % (check-can-read-keys %)) actions)
  (let [rows          (remove nil? actions)
        readable      (collection/content-readable-collection-ids (map :collection_id (remove model-less-root? rows))
                                                                  {:root-namespace nil, :audit-rules? false})
        root-readable (delay (contains? (collection/content-readable-collection-ids
                                         [nil] {:root-namespace collection/data-actions-ns, :audit-rules? false})
                                        nil))]
    (for [action actions]
      (when action
        (vary-meta action assoc :can_read (boolean (if (model-less-root? action)
                                                     @root-readable
                                                     (contains? readable (:collection_id action)))))))))

(methodical/defmethod t2/batched-hydrate [:model/Action :can_write]
  "Whether the current user writes each of `actions`: a superuser, writing its Collection's content, or, for an Action
  with neither a model nor a Collection, the data actions root on an instance remote sync doesn't keep read-only."
  [_model _k actions]
  (run! #(when % (check-can-read-keys %)) actions)
  (let [rows          (remove nil? actions)
        superuser?    (mi/superuser?)
        writable      (if superuser?
                        (collection/content-writable-collection-ids (map :collection_id (remove model-less-root? rows))
                                                                    {:root-namespace nil, :audit-rules? false})
                        #{})
        root-writable (delay (and (not (remote-sync/read-only?))
                                  (contains? (collection/content-writable-collection-ids
                                              [nil] {:root-namespace collection/data-actions-ns, :audit-rules? false})
                                             nil)))]
    (for [action actions]
      (when action
        (assoc action :can_write (boolean (and superuser?
                                               (if (model-less-root? action)
                                                 @root-writable
                                                 (contains? writable (:collection_id action))))))))))

(defmethod mi/can-create? :model/Action
  [_model action]
  (and (mi/superuser?)
       (collection-writable? action)))

(defmethod mi/can-update? :model/Action
  [action changes]
  (mi/can-update-all? :model/Action [action] changes))

(defmethod mi/can-update-all? :model/Action
  [_model actions changes]
  (let [actions   (t2/hydrate (vec actions) :can_write)
        writable? (collection-writable-fn (mapv #(merge % changes) actions))]
    (every? #(and (mi/can-write? %) (writable? (merge % changes))) actions)))
;;; ------------------------------------------- Request checks and CRUD fns ------------------------------------------

(defn check-implicit-actions-supported
  "Throws a 400 when `action` is implicit and its model's query does not support implicit actions."
  [{model-id :model_id, :as action}]
  (when (and (implicit? action) model-id)
    (check-query-supports-implicit-actions (actions.db/card-query model-id))))

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

(mu/defn adhoc-action :- ::actions.schema/action.for-insert
  "The ad-hoc `action`, built without saving it: an implicit one with its parameters derived from its Table, and a query
  one writing to the database of its query. It has the `:collection_id` and `:model_id` its checks read, nil when not
  given."
  [action :- ::actions.schema/action.adhoc]
  (let [action (merge {:collection_id nil, :model_id nil} action)]
    (t2/instance :model/Action
                 (if (= :implicit (keyword (:type action)))
                   (first (enrich-actions-with-implicit-params
                           [(merge {:visualization_settings {}} action)]))
                   (assoc action :database_id (get-in action [:dataset_query :database]))))))

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

(defn dashcard->action
  "Get the unarchived action associated with a dashcard if exists, return `nil` otherwise."
  [dashcard-or-dashcard-id]
  (when-let [action-id (actions.db/dashcard-action-id (u/the-id dashcard-or-dashcard-id))]
    (select-action :id action-id :archived false)))

;;; ------------------------------------------------- Hydration ------------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/Action :model]
  [_model k actions]
  (mi/instances-with-hydrated-data
   actions k
   #(when-let [model-ids (seq (keep :model_id actions))]
      (actions.db/cards-by-id model-ids))
   :model_id))

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

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- placements-of
  "A map of Card id to the id, type and Collection id of the models that `actions` are made on."
  [actions]
  (let [ids (into [] (comp (keep :model_id) (distinct)) actions)]
    (if (seq ids) (actions.db/card-placements ids) {})))

(defn- collections-of
  "A map of Collection id to its row for the content checks, for the Collections `actions` are in."
  [actions]
  (let [ids (into [] (comp (keep :collection_id) (distinct)) actions)]
    (collection/collections-for-content-checks ids)))

(defn- collection-of
  "The row of the Collection `action` is in, from `collections`, nil for none, and for one that does not exist, which the
  foreign key of `collection_id` refuses."
  [collections {:keys [collection_id]}]
  (when collection_id
    (get collections collection_id)))

(defn- check-detail-types
  "Throws unless each of the Actions with `action-ids` is of `action-type`, and returns a map of id to Action; one that
  does not exist is left to the foreign key of the details row."
  [action-ids action-type]
  (let [actions (actions.db/action-types-and-models (vec (distinct action-ids)))]
    (doseq [action-id action-ids
            :let      [action (get actions action-id)]
            :when     action]
      (check-details-type action action-type))
    actions))

(mu/defn- create-query-actions! :- [:sequential (ms/InstanceOf :model/QueryAction)]
  "Insert the QueryAction `rows`, the details of Actions that are query actions, in a plain write that publishes nothing,
  and return the inserted instances, each with the database its query names."
  [rows :- [:sequential ::actions.schema/query-action.create]]
  (if (empty? rows)
    []
    (do
      (check-detail-types (map :action_id rows) :query)
      (vec (actions.db/insert-query-actions! rows)))))

(mu/defn- update-query-actions! :- [:sequential ::actions.schema/query-action.update]
  "Apply the changes in each of `rows`, the id of a query Action and the columns to change, with one statement per
  distinct set of changes, in a plain write that publishes nothing, and return `rows`."
  [rows :- [:sequential ::actions.schema/query-action.update]]
  (doseq [[changes group] (group-by #(dissoc % :action_id) rows)]
    (when (seq changes)
      (actions.db/update-query-actions! (mapv :action_id group) changes)))
  (vec rows))

(mu/defn- delete-query-actions!
  "Delete the QueryActions of the Actions with `action-ids`, in one statement of a plain write that publishes nothing."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (when (seq action-ids)
    (actions.db/delete-query-actions! action-ids))
  nil)

(mu/defn- create-implicit-actions! :- [:sequential (ms/InstanceOf :model/ImplicitAction)]
  "Insert the ImplicitAction `rows`, the details of Actions that are implicit actions, in a plain write that publishes
  nothing, and return the inserted instances, an Action of a model taking no Table and an Action without a model
  needing one."
  [rows :- [:sequential ::actions.schema/implicit-action.create]]
  (if (empty? rows)
    []
    (let [actions (check-detail-types (map :action_id rows) :implicit)]
      (doseq [row rows]
        (check-implicit-action-table row (get actions (:action_id row))))
      (vec (actions.db/insert-implicit-actions! rows)))))

(mu/defn- update-implicit-actions! :- [:sequential ::actions.schema/implicit-action.update]
  "Apply the changes in each of `rows`, the id of an implicit Action and the columns to change, with one statement per
  distinct set of changes, in a plain write that publishes nothing, throwing for a Table given to an Action of a
  model or missing for an Action without one, and return `rows`."
  [rows :- [:sequential ::actions.schema/implicit-action.update]]
  (let [with-table (filter #(contains? % :table_id) rows)
        actions    (when (seq with-table)
                     (actions.db/action-types-and-models (mapv :action_id with-table)))]
    (doseq [row with-table]
      (check-implicit-action-table row (get actions (:action_id row))))
    (doseq [[changes group] (group-by #(dissoc % :action_id) rows)]
      (when (seq changes)
        (actions.db/update-implicit-actions! (mapv :action_id group) changes)))
    (vec rows)))

(mu/defn- delete-implicit-actions!
  "Delete the ImplicitActions of the Actions with `action-ids`, in one statement of a plain write that publishes
  nothing."
  [action-ids :- [:sequential ::lib.schema.id/action]]
  (when (seq action-ids)
    (actions.db/delete-implicit-actions! action-ids))
  nil)

(def ^:private detail-columns
  "The columns of an Action's QueryAction or ImplicitAction that a row of the Action carries with it."
  [:dataset_query :database_id :legacy_query :kind :table_id])

(defn- details-row
  "The columns of the details of an Action of `action-type` with `action-id` that `row`, the Action's columns with its
  details, holds."
  [row action-id action-type]
  (cond-> (assoc (select-keys row detail-columns) :action_id action-id)
    (= :implicit action-type) (dissoc :database_id)))

(defn- create-details!
  "Insert the QueryActions and the ImplicitActions of `details`, each `{:type :query or :implicit, :row details-row}`."
  [details]
  (let [rows-of (fn [action-type] (into [] (comp (filter #(= action-type (:type %))) (map :row)) details))]
    (create-query-actions! (rows-of :query))
    (create-implicit-actions! (rows-of :implicit))))

(defn- delete-details!
  "Delete the QueryActions and the ImplicitActions of `details`, each `{:type :query or :implicit, :id action-id}`."
  [details]
  (let [ids-of (fn [action-type] (into [] (comp (filter #(= action-type (:type %))) (map :id)) details))]
    (delete-query-actions! (ids-of :query))
    (delete-implicit-actions! (ids-of :implicit))))

(defn- update-details!
  "Apply the rows of `details`, each `{:type :query or :implicit, :row details-row}`, to the QueryActions and the
  ImplicitActions they name."
  [details]
  (let [rows-of (fn [action-type] (into [] (comp (filter #(= action-type (:type %))) (map :row)) details))]
    (update-query-actions! (rows-of :query))
    (update-implicit-actions! (rows-of :implicit))))

(defn- check-action-creates
  "Throw unless every one of `rows`, new Actions with the model `cards` and `collections` they read, satisfies these rules:

  - an implicit Action of a model has a model Card that can hold implicit Actions
  - it fits the Collection it is in
  - an Action in a data app Collection is one a data app may hold"
  [rows cards collections]
  (doseq [{model-id :model_id, :as row} rows
          :let                          [collection (collection-of collections row)]]
    (when (and (implicit? row) model-id)
      (check-model-card (get cards model-id)))
    (check-collection-content row collection)
    (check-data-app-action row (collection-namespace collection))))

(defn- insert-actions!
  "Inserts `rows`, the checked new Actions of one batch, and, unless `writer` imports, their details, and returns the new
  Actions."
  [rows writer]
  (let [actions (actions.db/insert-actions! (mapv #(select-keys % actions.db/action-columns) rows))]
    (when-not (= :import writer)
      (create-details! (mapv (fn [[action row]]
                               {:type (:type action)
                                :row  (details-row row (:id action) (:type action))})
                             (map vector actions rows))))
    actions))

(defn- create-action-batch!
  "Checks and inserts the Actions of `batch`, up to one partition of the call, and returns the new ones."
  [batch writer]
  (let [cards       (placements-of batch)
        rows        (mapv #(cond-> % (:model_id %) (set-model-collection (get cards (:model_id %)))) batch)
        collections (collections-of rows)]
    (check-action-creates rows cards collections)
    (insert-actions! rows writer)))

(mu/defn create-actions! :- [:sequential (ms/InstanceOf :model/Action)]
  "Insert the Action `rows`, each with the QueryAction or ImplicitAction columns of its details, in one transaction,
  publishing their create event last, and return the inserted instances, the rows of `:writer :import` holding no
  details, which the SerDes import writes on their own."
  ([rows :- [:sequential ::actions.schema/action.create]]
   (create-actions! rows nil))
  ([rows :- [:sequential ::actions.schema/action.create]
    opts :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [actions (into [] (mapcat #(create-action-batch! % (:writer opts)))
                         (partition-all mdb/create-partition-size rows))]
       (when (seq actions)
         (events/publish-event! :event/action-create (events/create-event actions opts)))
       actions))))

(defn- changes-of
  "The columns of `row`, an update of the stored Action `stored`, that differ from it."
  [stored row]
  (into {} (remove (fn [[k v]] (= v (get stored k)))) (dissoc row :id)))

(defn- update-context
  "What the checks of an update need to know about `row`, the update of the stored Action `stored`."
  [stored row]
  (let [action       (merge stored row)
        changes      (changes-of stored row)
        changed-any? (fn [ks] (boolean (some #(contains? changes %) ks)))]
    {:row        row
     :action     action
     :changes    changes
     :model-id   (:model_id action)
     :placement? (boolean (and (:model_id action) (changed-any? [:collection_id :type])))
     :placed?    (changed-any? [:collection_id :type :model_id :archived :public_uuid :parameters])}))

(defn- check-update
  "Throws when the update in `context` puts its Action where it does not fit, with the models `cards`, their
  `queries` and the `collections` read for it."
  [{:keys [action changes model-id placed?]} cards queries collections]
  (let [model-card (get cards model-id)
        collection (when placed? (collection-of collections action))]
    (when (and model-id
               (contains? changes :collection_id)
               (not= (:collection_id action) (:collection_id model-card)))
      (throw (model-collection-error)))
    (when (and (implicit? action) model-id (contains? changes :type))
      (check-model-card model-card)
      (check-query-supports-implicit-actions (get queries model-id)))
    (when (contains? changes :collection_id)
      (check-collection-content action collection))
    (when placed?
      (check-data-app-action action (collection-namespace collection)))))

(defn- check-model-unchanged
  "Throws a 400 when the update in `context` changes the model of its Action."
  [{:keys [changes]}]
  (when (contains? changes :model_id)
    (throw (ex-info (tru "An action''s model can''t be changed.") {:status-code 400}))))

(defn- detail-updates
  "The writes of the details that `rows`, updates of the stored Actions `stored`, change as
  `{:replaced [...] :kept [...]}`, `details` mapping an Action id to its stored details, `:replaced` holding for an Action whose type changes
  `{:id action-id, :old old-type, :new new-type, :row details-row}` and `:kept` holding for one whose details columns
  change `{:id action-id, :type action-type, :row details-row}`."
  [stored details rows]
  (let [updates (for [row   rows
                      :let  [id       (:id row)
                             old-type (:type (get stored id))
                             new-type (or (:type row) old-type)
                             detail   (details-row row id new-type)]
                      :when (and (seq (dissoc detail :action_id))
                                 (or (not= old-type new-type)
                                     (seq (changes-of (get details id) (assoc detail :id id)))))]
                  {:id id :old old-type :new new-type :row detail})]
    {:replaced (filterv #(not= (:old %) (:new %)) updates)
     :kept     (into [] (comp (filter #(= (:old %) (:new %))) (map (fn [{:keys [id new row]}] {:id id :type new :row row}))) updates)}))

(defn- write-details!
  "Write the `:replaced` and `:kept` writes of `updates`, as [[detail-updates]] gives them."
  [{:keys [replaced kept]}]
  (delete-details! (mapv (fn [{:keys [id old]}] {:type old :id id}) replaced))
  (create-details! (mapv (fn [{:keys [new row]}] {:type new :row row}) replaced))
  (update-details! kept))

(defn- publish-update!
  "Publish, as the last step of a write, the update event of the Actions that the `rows` change, and the touch event of
  those of `touched-ids` that they leave unchanged, whose details an import wrote, so that their records are made once,
  and nothing when there is none; `stored` holds the Actions as read before and `objects` as they are after."
  [stored objects rows touched-ids opts]
  (let [event   (events/update-event stored rows (assoc opts :objects objects))
        updated (into #{} (map (comp :id :object)) (:changes event))
        touched (into [] (comp (remove updated) (distinct) (keep stored)) touched-ids)
        event   (update event :changes into (:changes (events/touch-event touched)))]
    (when (seq (:changes event))
      (events/publish-event! :event/action-update event))))

(defmulti delete-for-archived-actions!
  "Delete the rows of `model` that show the Actions with `action-ids`, which are being archived. The DashboardCard
  model, whose namespace requires this one, implements it with its own write function."
  {:arglists '([model action-ids])}
  (fn [model _action-ids] model))

(defn- newly-archived-ids
  "The ids of the Actions of `rows`, updates of the stored Actions `stored`, that the rows archive."
  [stored rows]
  (into [] (comp (filter :archived) (remove #(:archived (get stored (:id %)))) (map :id)) rows))

(defn- update-action-contexts
  "The contexts of `rows`, updates of the `stored` Actions, and the details writes they make, `details` being the stored
  details by Action id."
  [stored details rows]
  (let [updates     (when details (detail-updates stored details rows))
        edited      (into #{} (map :id) (concat (:replaced updates) (:kept updates)))
        now         (OffsetDateTime/now)
        action-rows (mapv #(cond-> (select-keys % (conj actions.db/action-columns :id))
                             (contains? edited (:id %)) (assoc :updated_at now))
                          rows)]
    {:updates  updates
     :contexts (mapv #(update-context (get stored (:id %)) %) action-rows)}))

(defn- check-action-updates
  "Throw unless every one of `contexts`, updates of stored Actions, satisfies these rules, unless `opts` has
  `:writer :cascade`:

  - an Action that moves or changes type fits the model Card and the Collection it goes to
  - an Action in a data app Collection is one a data app may hold
  - the model of an Action does not change, unless `opts` has a `:writer`"
  [contexts opts]
  (when-not (= :cascade (:writer opts))
    (let [cards       (placements-of (map :action (filter :placement? contexts)))
          query-ids   (into [] (comp (filter #(and (implicit? (:action %)) (contains? (:changes %) :type)))
                                     (keep :model-id)
                                     (distinct))
                            contexts)
          queries     (if (seq query-ids) (actions.db/card-queries query-ids) {})
          collections (collections-of (map :action (filter :placed? contexts)))]
      (run! #(check-update % cards queries collections) contexts)))
  (when (nil? (:writer opts))
    (run! check-model-unchanged contexts)))

(defn- write-action-updates!
  "Writes the `contexts` and details `updates` of the `stored` Actions, deletes the DashboardCards of those that are
  archived on their own, and returns the rows as the update event needs them and the Actions after the write."
  [stored {:keys [updates contexts]} opts]
  (let [action-rows (mapv :row contexts)
        ids         (mapv :id action-rows)]
    (actions.db/update-actions! action-rows)
    (when updates
      (write-details! updates))
    (when-let [archived-ids (and (nil? (:writer opts)) (not-empty (newly-archived-ids stored action-rows)))]
      (t2/resolve-model :model/DashboardCard)
      (delete-for-archived-actions! :model/DashboardCard archived-ids))
    (let [updated (actions.db/actions-by-ids ids)]
      {:stored  stored
       :updated updated
       :rows    (mapv (fn [row {:keys [changes]}]
                        (cond-> row
                          (and (contains? changes :archived) (not (contains? row :archived_directly)))
                          (assoc :archived_directly (:archived_directly (get updated (:id row))))))
                      action-rows contexts)})))

(defn- update-action-batch!
  "Checks and writes the Actions of `batch`, up to one partition of the call, and returns what the event needs."
  [batch opts]
  (let [stored   (actions.db/actions-by-ids (mapv :id batch))
        details  (when (some #(seq (select-keys % detail-columns)) batch)
                   (into {} (map (juxt :action_id identity))
                         (concat (actions.db/query-actions (mapv :id batch))
                                 (actions.db/implicit-actions (mapv :id batch)))))
        planned  (update-action-contexts stored details batch)]
    (check-action-updates (:contexts planned) opts)
    (write-action-updates! stored planned opts)))

(mu/defn update-actions! :- :nil
  "Apply the changes in each of `rows`, the id of an Action, the Action columns to change and the columns of its
  details, in one transaction, publishing their update event last with the `:context` of `opts`, and with
  `:writer :import` a touch of an Action that the rows leave unchanged."
  ([rows :- [:sequential ::actions.schema/action.update]]
   (update-actions! rows nil))
  ([rows :- [:sequential ::actions.schema/action.update]
    opts :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [batches (mapv #(update-action-batch! % opts) (partition-all mdb/update-partition-size rows))]
       (publish-update! (into {} (map :stored) batches)
                        (into {} (map :updated) batches)
                        (into [] (mapcat :rows) batches)
                        (if (= :import (:writer opts)) (mapv :id rows) [])
                        opts)))
   nil))

(mu/defn update-action! :- :nil
  "Apply `changes`, the columns of the Action with `id` and those of its details, in one transaction, publishing one
  update event, a change of the details columns alone setting the update time of the Action and a change of its
  `:type` replacing its QueryAction or ImplicitAction."
  [id      :- ::actions.schema/id
   changes :- (mut/dissoc ::actions.schema/action.update :id)
   opts    :- :metabase.events.schema/write-opts]
  (update-actions! [(assoc changes :id id)] opts)
  nil)

(defenterprise delete-action-tests-for-actions!
  "Delete the tests of the actions with `action-ids`. No-op in OSS."
  metabase-enterprise.data-testing.models.action-test
  [_action-ids]
  nil)

(mu/defn delete-actions! :- :nil
  "Delete the Actions with `ids`, and their QueryActions, ImplicitActions and tests with them, in one transaction,
  publishing their delete event right before the first statement."
  [ids :- [:sequential ::lib.schema.id/action]]
  (mdb/delete-batched! :model/Action ids
                       {:before-delete (fn [actions]
                                         (events/publish-event! :event/action-delete (events/delete-event actions))
                                         ;; The `action_test.action_id` foreign key cascades, but a cascade neither
                                         ;; sets the test id of the tests' runs to null nor takes the tests out of
                                         ;; their suites.
                                         (delete-action-tests-for-actions! (mapv :id actions)))}))

(mu/defn update-actions-for-models!
  "Move the Actions of the model Cards, the keys of `model-id->collection-id`, to the Collection each maps to, nil for
  the root, in one pass over all of them with one statement for each Collection."
  [model-id->collection-id :- [:map-of ::lib.schema.id/card [:maybe ::lib.schema.id/collection]]]
  (when (seq model-id->collection-id)
    (update-actions! (mapv (fn [{:keys [id model_id]}] {:id id :collection_id (get model-id->collection-id model_id)})
                           (actions.db/action-model-ids (vec (keys model-id->collection-id))))
                     nil)
    nil))

(mu/defn action-ids-of-models :- [:sequential ::lib.schema.id/action]
  "The ids of the Actions of the model Cards with `model-ids`."
  [model-ids :- [:sequential ::lib.schema.id/card]]
  (actions.db/action-ids-of-models model-ids))

(mu/defn action-ids-of-tables :- [:sequential ::lib.schema.id/action]
  "The ids of the Actions that write to the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (actions.db/implicit-action-ids-of-tables table-ids))

(mu/defn action-ids-of-databases :- [:sequential ::lib.schema.id/action]
  "The ids of the query Actions whose query runs against one of the Databases with `database-ids` and of the implicit
  Actions that write to one of their Tables."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (actions.db/action-ids-of-databases database-ids))

(defmethod database/delete-for-databases! :model/Action
  [_model databases]
  (delete-actions! (action-ids-of-databases (mapv :id databases))))

(defmethod collection/archive-in-collections! :model/Action
  [_model collection-ids opts]
  (update-actions! (mapv (fn [id] {:id id :archived true :archived_directly false}) (mapv :id (actions.db/unarchived-actions-in-collections (vec collection-ids)))) (assoc opts :writer :cascade)))

(defmethod collection/restore-in-collections! :model/Action
  [_model collection-ids opts]
  (update-actions! (mapv (fn [id] {:id id :archived false :archived_directly false}) (vec (actions.db/restorable-action-ids-in-collections (vec collection-ids)))) (assoc opts :writer :cascade)))

(defmethod collection/delete-in-collections! :model/Action
  [_model collection-ids _opts]
  (delete-actions! (mapv :id (actions.db/actions-in-collections (vec collection-ids)))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Action [_model]
  {:skip? false})

(defmethod serialization/spec :model/Action [_]
  {:schema              ::actions.schema/external-action
   :copy                [:archived :archived_directly :description :entity_id :name :public_uuid :type]
   :skip                [:public_uuid_prefix]
   :transform           {:creator_id             serialization/user-transform
                         :made_public_by_id      serialization/user-transform
                         :collection_id          (serialization/fk-transform :model/Collection)
                         :model_id               (serialization/fk-transform :model/Card)
                         :parameters             serialization/parameters-transform
                         :parameter_mappings     serialization/parameter-mappings-transform
                         :visualization_settings serialization/visualization-settings-transform}
   :children            {:query    :model/QueryAction
                         :implicit :model/ImplicitAction}
   :defaults            {:archived false, :archived_directly false}
   :storage-paths       actions.serialization/storage-paths
   :import-dependencies actions.serialization/import-dependencies
   :export-dependencies actions.serialization/export-dependencies
   :loaded-entities     actions.serialization/loaded-entities
   :insert!             #(create-actions! % {:writer :import})
   :update!             #(do (update-actions! % {:writer :import}) %)
   :delete!             delete-actions!})

(defmethod remote-sync/spec :model/Action
  [_model]
  {:synced-items         actions.db/synced-action-items
   :synced-filter-clause actions.db/synced-actions-clause})

(defmethod search/spec :model/Action
  [_model]
  {"action"
   {:attrs        {:archived       true
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
                   :collection   [:model/Collection [:= :collection.id :this.collection_id]]}}})

(defmethod dependencies/spec :model/Action [_model]
  {:type  :action
   :items actions.db/dependency-action-items

   :hydrate      actions.dependencies/hydrate
   :dependencies actions.dependencies/dependencies

   :dependency-columns  #{:model_id :type}
   :written-with-parts? true})

(defmethod collection-items/spec :model/Action [_model]
  {"action" {:items   actions.db/collection-action-items
             :hydrate actions.collection-items/hydrate}})

(defmethod eid-translation/spec :model/Action [_model]
  {:names [:action]})

(defmethod app-db-copy/spec :model/QueryAction [_model]
  {:skip?    false
   :sequence false})

(defmethod serialization/spec :model/QueryAction [_]
  {:schema    ::actions.schema/external-query-action
   :identity  [:action_id]
   :skip      [:legacy_query]
   :parent    {:model :model/Action :key :action_id}
   :transform {:action_id     serialization/import-only-transform
               :database_id   serialization/database-transform
               :dataset_query serialization/mbql-transform}
   :insert!   create-query-actions!
   :update!   update-query-actions!
   :delete!   delete-query-actions!})

(defmethod remote-sync/spec :model/QueryAction
  [_model]
  {:synced-filter-clause actions.db/synced-action-details-clause})

(defmethod app-db-copy/spec :model/ImplicitAction [_model]
  {:skip?    false
   :sequence false})

(defmethod serialization/spec :model/ImplicitAction [_]
  {:schema    ::actions.schema/external-implicit-action
   :identity  [:action_id]
   :copy      [:kind]
   :parent    {:model :model/Action :key :action_id}
   :transform {:action_id serialization/import-only-transform
               :table_id serialization/table-transform}
   :insert!   create-implicit-actions!
   :update!   update-implicit-actions!
   :delete!   delete-implicit-actions!})

(defmethod remote-sync/spec :model/ImplicitAction
  [_model]
  {:synced-filter-clause actions.db/synced-action-details-clause})
