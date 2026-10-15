(ns metabase-enterprise.library-branching.gates
  "The edit gates of a consumption instance. A consumption instance shows the content of its branch and changes it
  only by a deploy, so an edit, a create or a trash of an item that it syncs is refused; reads are not gated. Each
  gate answers from the scope function: an existing row by its app DB id, a new item by its place. The editability
  hooks of Metabase ask these functions while library branching is on ([[governs?]])."
  (:require
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase-enterprise.library-branching.settings :as settings]))

(set! *warn-on-reflection* true)

(defn governs?
  "True iff library branching is on, so that its gates, and not those of remote sync, decide what is editable."
  []
  (boolean (settings/library-branching-enabled)))

(defn consumption-instance?
  "True iff this instance is a consumption instance: library branching is on, a repository URL is set, and
  `remote-sync-type` is not read-write."
  []
  (and (governs?) (repository/configured?) (not (repository/read-write?))))

(defn- row-id
  "The app DB id of `x`, a row, a map with `:id`, or an id; nil for anything else (the root collection, a new item)."
  [x]
  (let [id (if (map? x) (:id x) x)]
    (when (pos-int? id) id)))

(defn- synced?
  "True iff `instance`, a row or the values of a new item of `kind`, is an item that this instance syncs."
  [kind instance]
  (if-let [id (row-id instance)]
    (scope/row-in-scope? kind id)
    (scope/place-in-scope? kind (:collection_id instance))))

(defn collection-editable?
  "False iff this is a consumption instance and `collection` (a collection, its id, or nil for the root collection) is
  a collection that it syncs. The items in a collection use this gate through the permissions of their collection."
  [collection]
  (not (and (consumption-instance?)
            (some? (row-id collection))
            (scope/row-in-scope? :collection (row-id collection)))))

(defn table-editable?
  "False iff this is a consumption instance and `table` is a published table that it syncs. The fields, segments and
  measures of a table use this gate."
  [table]
  (not (and (consumption-instance?)
            (some? (row-id table))
            (scope/row-in-scope? :published-table (row-id table)))))

(defn transforms-editable?
  "False iff this is a consumption instance: it syncs every transform."
  []
  (not (consumption-instance?)))

(def ^:private model-kinds
  "The kind of the items of each model whose editability hook takes a model key."
  {:model/Action             :action
   :model/DataApp            :data-app
   :model/Glossary           :glossary-term
   :model/NativeQuerySnippet :snippet
   :model/Transform          :transform})

(defn- card-kind
  [card]
  (case (some-> (:type card) name)
    "metric" :metric
    "model"  :model
    :question))

(defn- kind-of
  [model-key instance]
  (if (= :model/Card model-key)
    (card-kind instance)
    (get model-kinds model-key)))

(defn model-editable?
  "False iff this is a consumption instance and `instance` (a row, the values of a new item, or nil for a new item at
  the root level) of the model `model-key` is an item that it syncs. A model with no kind is editable."
  [model-key instance]
  (let [kind (kind-of model-key instance)]
    (not (and kind (consumption-instance?) (synced? kind instance)))))

(defn batch-model-editable?
  "`{id editable?}` of [[model-editable?]] for each of `instances`."
  [model-key instances]
  (if (consumption-instance?)
    (into {} (map (juxt :id (partial model-editable? model-key))) instances)
    (into {} (map (fn [inst] [(:id inst) true])) instances)))
