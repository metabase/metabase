(ns metabase.collections.governing-collection
  "Permission checks on the governing collection of an item: the collection it is in, or, when its `collection_id` is
  nil, the root collection of a collection namespace."
  (:require
   [metabase.api.common :as api]
   [metabase.collections.db :as collections.db]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]))

(declare root-namespace)

(defn- dispatch-on-declared-model
  [model-or-instance]
  (let [model (mi/dispatch-on-model model-or-instance)]
    (when-not (get-method root-namespace model)
      (throw (ex-info (format "%s does not declare which root collection a nil collection_id means. Add a %s method."
                              model `root-namespace)
                      {:model model})))
    model))

(defmulti root-namespace
  "The collection namespace whose root collection a nil `collection_id` means for `model`."
  {:arglists '([model])}
  dispatch-on-declared-model)

(mu/defn- governing-collection
  [collection-namespace :- [:maybe [:or :keyword :string]]
   collection-id        :- [:maybe ::lib.schema.id/collection]]
  (if (some? collection-id)
    (collections.db/collection collection-id)
    (assoc collection.root/root-collection :namespace collection-namespace)))

(mu/defn can-read-governing-collection?
  "Whether the current user can read the governing collection."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   collection-id        :- [:maybe ::lib.schema.id/collection]]
  (mi/can-read? (governing-collection collection-namespace collection-id)))

(mu/defn can-write-governing-collection?
  "Whether the current user can write the governing collection."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   collection-id        :- [:maybe ::lib.schema.id/collection]]
  (mi/can-write? (governing-collection collection-namespace collection-id)))

(mu/defn check-read-governing-collection
  "Like [[can-read-governing-collection?]], but throws a 403, or a 404 if `collection-id` names no collection. Returns
  the collection checked."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   collection-id        :- [:maybe ::lib.schema.id/collection]]
  (api/read-check (governing-collection collection-namespace collection-id)))

(mu/defn check-write-governing-collection
  "Like [[can-write-governing-collection?]], but throws a 403, or a 404 if `collection-id` names no collection. Returns
  the collection checked."
  [collection-namespace :- [:maybe [:or :keyword :string]]
   collection-id        :- [:maybe ::lib.schema.id/collection]]
  (api/write-check (governing-collection collection-namespace collection-id)))
