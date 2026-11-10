(ns metabase.serialization.spec
  "The serialization spec of a model, and what it says about the model.

  A spec is a map of:

  - `:schema`, the schema of an exported entity; dev and test check every export against it.
  - `:copy`, the columns exported and imported as they are.
  - `:skip`, the columns that are not serialized (`:id`, `:created_at` and `:updated_at` never are).
  - `:transform`, a map from a column to its transform, `{:export f :import g}`, where `f` and `g` are fns of the
    store, the batch (rows on export, entities on import), the column's values in that batch, and the import options
    (empty on export), returning the transformed values in the same order. An `:as` key exports the column under
    another key. A transform with no `:export` is never exported.
  - `:defaults`, the default `true` or `false` of boolean columns. An export leaves out the columns that are nil or at
    their default, and an import sets each column the spec copies or exports that an entity lacks to its default, or
    to nil.
  - `:identity`, the columns whose values make the ref of a row, which finds the row an imported row updates,
    `[:entity_id]` by default (see [[metabase.serialization.protocol/select-by-refs]]).
  - `:primary-key`, the primary key column of the model, `:id` by default.
  - `:children`, the map from a key to a child model whose rows the rows of this model own, which they export nested
    under that key and load with, deleting the children a loaded entity no longer holds.
  - `:parent`, for a child model, `{:model parent-model :key column :order key-fn :import-only? bool}`: `column` holds
    the primary key of the parent, `key-fn` sorts the children nested in its entity, and with `:import-only?` the
    children export as entities of their own and load nested only from older exports."
  (:require
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
  "The primary key column of `model`."
  [model]
  (or (:primary-key (spec model)) :id))

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
