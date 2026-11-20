(ns metabase.serialization.spec
  "The serialization spec of a model, and what it says about the model.

  A spec is a map of:

  - `:schema`, the schema of an exported entity; dev and test check every export against it.
  - `:copy`, the columns exported and imported as they are.
  - `:skip`, the columns that are not serialized (`:id`, `:created_at` and `:updated_at` never are).
  - `:transform`, a map from a column to its transform, `{:export f :import g}`, where `f` and `g` are fns of the
    store, the batch (rows on export, entities on import), the column's values in that batch, and the import options
    (empty on export), returning the transformed values in the same order. An `:as` key exports the column under
    another key. A transform with no `:export` is never exported. A transform with `:validates-query?` imports a query
    that it validates against the query schema itself, so an import leaves its column out of the check of the entity
    against `:schema`.
  - `:defaults`, the default `true` or `false` of boolean columns. An export leaves out the columns that are nil or at
    their default, and an import sets each column the spec copies or exports that an entity lacks to its default, or
    to nil.
  - `:identity`, the columns whose values make the ref of a row, which finds the row an imported row updates,
    `[:entity_id]` by default (see [[metabase.serialization.protocol/select-by-refs]]).
  - `:children`, the map from a key to a child model whose rows the rows of this model own, which they export nested
    under that key and load with, deleting the children a loaded entity no longer holds.
  - `:parent`, for a child model, `{:model parent-model :key column :order key-fn :import-only? bool}`: `column` holds
    the primary key of the parent, `key-fn` sorts the children nested in its entity, and with `:import-only?` the
    children export as entities of their own and load nested only from older exports.

  And, all optional, the fns a model needs beyond the columns, each a default when absent:

  - `:storage-paths`, `(fn [entities ctx])`, the storage path of each of `entities` (see
    [[metabase.serialization.storage/storage-paths]]), by default the one of its collection.
  - `:resource-paths`, `(fn [entity])`, the paths of the files stored next to the file of `entity`, by default none.
  - `:export-dependencies`, `(fn [rows])`, the set of `[model id]` each of `rows` depends on, by default none.
  - `:import-dependencies`, `(fn [entities])`, the set of `[model ref]` each of `entities` depends on, by default none.
  - `:loaded-entities`, `(fn [entities])`, the entities an import loads, so a model can leave out the shapes of older
    exports it no longer loads, by default all of them.
  - `:before-load`, `(fn [items])`, the load items to load (see [[metabase.serialization.load/before-load]]), by
    default all of them as they are.
  - `:after-load`, `(fn [items])`, the side effects of loading `items`, by default none.
  - `:entity-ref`, `(fn [entity])`, the ref of `entity`, by default made of the exported values of its `:identity`.
  - `:rows-by-refs`, `(fn [refs columns])`, the map from each of the set `refs` to the oldest row of the app DB with
    that ref, with only `columns` unless nil, by default found by entity id.
  - `:rows-by-parent-pks`, `(fn [parent-pks columns])`, the rows of the app DB, with `columns`, whose parent has its
    primary key in `parent-pks`, a batch of them, by default those whose `:parent` `:key` column holds one of them.

  A method of [[spec]] returns a literal map whose fns are references to fns defined elsewhere, which keeps reading a
  spec cheap."
  (:require
   [metabase.util.malli.registry :as mr]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(defmulti spec
  "The serialization spec of `model`, or nil when the model is not serialized."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))

(mr/def ::transform
  "A transform of a column of a spec."
  [:map {:closed true}
   [:export           {:optional true} ifn?]
   [:import           {:optional true} ifn?]
   [:as               {:optional true} :keyword]
   [:validates-query? {:optional true} :boolean]])

(mr/def ::parent
  "The `:parent` of the spec of a child model."
  [:map {:closed true}
   [:model        :keyword]
   [:key          :keyword]
   [:order        {:optional true} ifn?]
   [:import-only? {:optional true} :boolean]])

(mr/def ::spec
  "The serialization spec of a model."
  [:map {:closed true}
   [:schema              some?]
   [:copy                {:optional true} [:sequential :keyword]]
   [:skip                {:optional true} [:sequential :keyword]]
   [:transform           {:optional true} [:map-of :keyword ::transform]]
   [:defaults            {:optional true} [:map-of :keyword :boolean]]
   [:identity            {:optional true} [:sequential {:min 1} :keyword]]
   [:children            {:optional true} [:map-of :keyword :keyword]]
   [:parent              {:optional true} ::parent]
   [:storage-paths       {:optional true} fn?]
   [:resource-paths      {:optional true} fn?]
   [:export-dependencies {:optional true} fn?]
   [:import-dependencies {:optional true} fn?]
   [:loaded-entities     {:optional true} fn?]
   [:before-load         {:optional true} fn?]
   [:after-load          {:optional true} fn?]
   [:entity-ref          {:optional true} fn?]
   [:rows-by-refs        {:optional true} fn?]
   [:rows-by-parent-pks  {:optional true} fn?]])

(defn spec-of
  "The serialization spec of `model`, throwing when it has none."
  [model]
  (or (spec model)
      (throw (ex-info (str "No serialization spec defined for model " model) {:model model}))))

(defn identity-columns
  "The `:identity` columns of the spec of `model`, `[:entity_id]` by default."
  [model]
  (or (:identity (spec model)) [:entity_id]))

(defn primary-key
  "The primary key column of `model`, which must have exactly one."
  [model]
  (let [pks (t2.model/primary-keys model)]
    (when-not (= 1 (count pks))
      (throw (ex-info (format "Serialization needs a single primary key column, and %s has %s" model (pr-str pks))
                      {:model model :primary-keys pks})))
    (first pks)))

(defn parent
  "The `:parent` of the spec of `model`, `{:model parent-model :key column :order key-fn}`, or nil."
  [model]
  (:parent (spec model)))

(defn children
  "The `:children` of the spec of `model`, the map from the key its entity nests them under to each child model."
  [model]
  (:children (spec model)))

(defn columns
  "The columns an export of `model` selects: its primary key and the columns its spec copies or exports."
  [model]
  (let [spec (spec-of model)]
    (into [] (distinct) (concat [(primary-key model)]
                                (:copy spec)
                                (keep (fn [[k t]] (when (:export t) k)) (:transform spec))))))
