(ns metabase.collection-items.spec
  "The collection items spec of a model, and what it says about the model.

  A model that has a spec can be listed as items of a Collection. The spec is a map from the name of each type of item
  the model lists, the `?models=` value and the `model` of the item, to the spec of that type, a map of:

  - `:items`, a fn of the Collection to list the items of, the Root Collection or the Trash included, and of the
    `:metabase.collection-items.core/CollectionChildrenOptions`, returning the full HoneySQL query of the items of the
    type in the Collection, or nil when the options rule the type out, for the items listed only hold what the type
    has to do with. The query selects whichever of the columns of the listing apply to the type, and the listing pads
    the others.
  - `:hydrate`, optional, a fn of the Collection, the options and the rows of the type as the query selects them,
    returning the rows as the API shows them, loaded in bulk.
  - `:rank`, optional, the rank of the type when sorting by type, 100 by default."
  (:require
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(def Spec
  "The schema of the collection items spec of one type of item."
  [:map {:closed true}
   [:items   ifn?]
   [:hydrate {:optional true} ifn?]
   [:rank    {:optional true} pos-int?]])

(def ModelSpec
  "The schema of the collection items spec of a model."
  [:map-of :string Spec])

(defmulti spec
  "The collection items spec of `model`, a map from the name of each type of item the model lists to its spec, or nil
  when no item of the model is listed in a Collection."
  {:arglists '([model])}
  identity)

(defmethod spec :default [model]
  (when (and (qualified-keyword? model) (= "model" (namespace model)))
    (try
      (t2.model/resolve-model model)
      (catch Exception _ nil))
    (when-not (= (get-method spec model) (get-method spec :default))
      (spec model))))
