(ns metabase-enterprise.library-branching.instance.kinds.action
  "The app DB side of the kind `:action`, in the item form of `format.kinds.action`. The place of an action with a
  model is the model; of an action with no model, its collection, or the root of the Data actions area for an action at
  the root level of the data actions namespace.
  `:dataset_query` is the portable form of the query of a query action, `:implicit_kind` the kind of an implicit
  action; the other attributes are the action columns of the same names, in the portable form of the serdes export of
  Action. Not content: the archive columns (scope), the public link (instance-local), the database of a query action
  (derived from its query), the collection of an action with a model (derived from its model) and the bookkeeping
  columns.

  An action row is in the Library tree iff its collection is, or it has no model and no collection. A trash moves the
  action to the trash and changes no dashboard: a dashboard outside the Library keeps its button, whose action still
  resolves."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.action :as format.action]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.snapshot :as snapshot]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- transforms
  "`{attribute {:export f :import g}}`: the serdes transforms of the attributes whose column the serdes specs of Action
  and QueryAction transform."
  []
  (let [action (:transform (serdes/make-spec "Action" {}))
        query  (:transform (serdes/make-spec "QueryAction" {}))]
    (merge (select-keys action [:parameters :parameter_mappings :visualization_settings])
           (select-keys query [:dataset_query]))))

(defn- export-fn
  [ts k]
  (get-in ts [k :export] identity))

(defn- without-nil-settings
  "Visualization settings without a top-level key whose value is nil; the export adds `:column_settings nil`."
  [settings]
  (some->> settings (into {} (remove (comp nil? val)))))

(defn attrs
  "The attributes of action `row`, whose query is `query` (nil for an implicit action) and whose implicit kind is
  `implicit-kind` (nil for a query action), with none at its default. `ts` is [[transforms]]; `model` is the identity
  of the model, or nil."
  [ts model row query implicit-kind]
  (->> {:description            (:description row)
        :model                  model
        :type                   (some-> (:type row) u/qualified-name)
        :implicit_kind          (some-> implicit-kind u/qualified-name)
        :dataset_query          (some-> query ((export-fn ts :dataset_query)))
        :parameters             ((export-fn ts :parameters) (:parameters row))
        :parameter_mappings     ((export-fn ts :parameter_mappings) (:parameter_mappings row))
        :visualization_settings (without-nil-settings
                                 ((export-fn ts :visualization_settings) (:visualization_settings row)))}
       portable/document
       (content/attrs format.action/spec)))

(defn- portable-content
  [ts queries implicit-kinds {:keys [id model_id collection_id] :as row}]
  (let [model (some-> model_id (serdes/*export-fk* :model/Card))]
    {:place (cond
              model         model
              collection_id (serdes/*export-fk* collection_id :model/Collection)
              :else         (snapshot/area-root :data-actions))
     :attrs (attrs ts model row (get queries id) (get implicit-kinds id))}))

(defn read-actions
  "`{entity-id item}` of the actions of `entity-ids`."
  [entity-ids]
  (let [rows           (content/in-chunks library-branching.db/actions-by-entity-id (vec entity-ids))
        ids            (mapv :id rows)
        queries        (into {} (map (juxt :action_id :dataset_query))
                             (content/in-chunks library-branching.db/query-actions-by-action-id ids))
        implicit-kinds (into {} (map (juxt :action_id :kind))
                             (content/in-chunks library-branching.db/implicit-actions-by-action-id ids))
        contents       (portable/export-batch (partial portable-content (transforms) queries implicit-kinds) rows)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :action entity_id name place attrs)])
               rows
               contents))))

(defn row-in-tree?
  "True iff action row `row` (`{:model_id :collection_id}`) is in the Library tree: its collection is, or it has no
  model and no collection."
  [{:keys [model_id collection_id]}]
  (if (some? collection_id)
    (tree/collection-id-in-tree? collection_id)
    (nil? model_id)))

(defn current-action
  "The content of the in-scope action `id`, after a lock on its row and its query or implicit row, or nil."
  [id]
  (library-branching.db/lock-action id)
  (when (scope/in-scope? :action id)
    (get (read-actions [id]) id)))

(defn- model-card!
  "The card row of `model`, the model of action `id`. Throws ::instance/refused unless it is an in-scope model."
  [id model]
  (let [card (library-branching.db/card-by-entity-id model)]
    ;; Scope holds a card of kind :model only when it is a model.
    (when-not (and card (scope/in-scope? :model model))
      (instance/refuse! :place id (str "The model " model " of the action is not an in-scope model on this instance.")
                        {:place model}))
    card))

(defn- model-less-collection!
  "The collection row of `place`, the place of action `id` with no model, or nil at the root of the Data actions area.
  Throws ::instance/refused unless `place` is that area root or an in-scope collection of the data actions or data
  apps namespace."
  [id place]
  (when (nil? place)
    (instance/refuse! :place id (str "An action with no model is in a data actions or data app collection, or at the"
                                     " root of the Data actions area.")))
  (when-not (tree/place-area :action id place)
    (let [row (tree/place-collection id place)]
      (when-not (contains? snapshot/action-namespaces (:namespace row))
        (instance/refuse! :place id "An action with no model is in a data actions or data app collection."
                          {:place place}))
      row)))

(defn- columns
  "The action columns of the attributes `ks` of `attrs`, an absent one at its default, through the serdes imports: the
  columns of the action row, and of its query or implicit row (`:dataset_query`, `:kind`)."
  [attrs ks]
  (let [ts    (transforms)
        value #(content/attr-value format.action/spec attrs %)]
    (into {}
          (map (fn [k]
                 (let [v (value k)]
                   (case k
                     :type          [:type (keyword v)]
                     :implicit_kind [:kind (some-> v keyword)]
                     [k (if (some? v) ((get-in ts [k :import] identity) v) v)]))))
          ks)))

(def ^:private row-attrs
  "The attributes that are columns of the action row."
  #{:description :type :parameters :parameter_mappings :visualization_settings})

(defn- type-attrs
  "The attributes that are columns of the query or implicit row of an action of type `type`."
  [type]
  (if (= "implicit" type) #{:implicit_kind} #{:dataset_query}))

(defn write-action!
  "Makes the content of action `id` equal to `item`, by the contract of `instance/write!`."
  [id {:keys [name place attrs] :as item}]
  ;; The write goes through the models Action, QueryAction and ImplicitAction, as a serdes load does; the Action model
  ;; sets the collection of an action with a model to its model's.
  (content/check-item! :action id item)
  (let [row        (library-branching.db/lock-action id)
        _          (when row (tree/check-in-tree! id (row-in-tree? row)))
        model      (:model attrs)
        card       (when model (model-card! id model))
        collection (when-not model (model-less-collection! id place))
        type-now   (:type attrs)]
    (if-not row
      (library-branching.db/insert-action!
       (merge {:entity_id     id
               :name          name
               :model_id      (:id card)
               :collection_id (:id collection)
               :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
              (columns attrs row-attrs))
       (columns attrs (type-attrs type-now)))
      (let [old     (get (read-actions [id]) id)
            changed (content/changed-attrs format.action/spec (:attrs old) attrs)
            ;; The attributes of a new type are absent from the old content, so they are among the changed ones.
            type-ks (filter (type-attrs type-now) changed)
            changes (cond-> (columns attrs (filter row-attrs changed))
                      (not= name (:name old))           (assoc :name name)
                      (not= (:id card) (:model_id row)) (assoc :model_id (:id card))
                      (and (nil? card)
                           (not= (:id collection) (:collection_id row)))
                      (assoc :collection_id (:id collection))
                      (:archived row)                   (assoc :archived false :archived_directly false))]
        (library-branching.db/update-action! (:id row) (:type row) changes (columns attrs type-ks))))
    nil))

(defn trash-action!
  "Moves action `id` to the trash. Throws ::instance/refused for an action in the collection of a data app, which
  Metabase keeps out of the trash."
  [id]
  (when-let [row (library-branching.db/lock-action id)]
    (tree/check-in-tree! id (row-in-tree? row))
    (when-not (:archived row)
      (when (some-> (:collection_id row) library-branching.db/resource-collection?)
        (instance/refuse! :no-trash id "Metabase keeps an action in the collection of a data app out of the trash."))
      (library-branching.db/archive-action! (:id row)))
    nil))

(def ^:private models-of-read
  "The models whose tables a read of actions reads: the actions with their query and implicit rows, the cards and
  collections of their places, and the databases, tables, fields, cards, snippets and dashboards that a query, a
  parameter or the visualization settings refer to."
  #{:model/Action :model/Card :model/Collection :model/Dashboard :model/Database :model/Field :model/ImplicitAction
    :model/NativeQuerySnippet :model/QueryAction :model/Table})

(def kind-store
  "The `KindStore` of actions."
  (reify instance/KindStore
    (read-all [_ ids] (read-actions ids))
    (read-models [_] models-of-read)
    (current [_ id] (current-action id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-action! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-action! id)))))
