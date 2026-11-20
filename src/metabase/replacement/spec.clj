(ns metabase.replacement.spec
  "The replacement spec of a model, and what it says about the model.

  A replacement replaces a data source, a card or a table, by another across every entity that uses it: for each
  using entity it first upgrades the field refs, then swaps the source. The entity type of a model is the `:type` of
  its dependencies spec. All the keys are optional:

  - `:source-database-id`, a fn of a row returning the id of its database, which makes the model's rows sources that a
    replacement can replace or replace with.
  - `:hydrate`, a fn of a vector of rows returning them with what `:upgrade-field-refs` and `:swap-source` need,
    loaded in bulk.
  - `:upgrade-field-refs`, a pure fn of a hydrated row returning the writes that upgrade its field refs.
  - `:swap-source`, a pure fn of a hydrated row, the old source and the new source, each as `[entity-type id]`,
    returning the writes that swap the old source for the new one, or nil when the row has no query to swap.

  The writes are a vector of `[model id changes]`, each applied as an update of the row of `model` with `id`, in
  order, and empty when nothing changes."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of a replacement spec."
  [:map {:closed true}
   [:source-database-id {:optional true} ifn?]
   [:hydrate            {:optional true} ifn?]
   [:upgrade-field-refs {:optional true} ifn?]
   [:swap-source        {:optional true} ifn?]])

(def Writes
  "The schema of the writes that `:upgrade-field-refs` and `:swap-source` return."
  [:sequential [:tuple :keyword pos-int? :map]])

(defmulti spec
  "The replacement spec of `model`, or nil when no replacement touches the model."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
