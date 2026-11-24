(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn all-users
  "Every User."
  []
  (t2/select :model/User))

(mu/defn collection-id-row
  "The `:collection_id` row of the instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one [model :collection_id] :id id))

(mu/defn existing-ids
  "The subset of `ids` for which an instance of `model` exists."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (mdb/select-batched-set #(t2/select-pks-set model {:where [:in :id %]}) ids))

(mu/defn existing-pks :- [:set :any]
  "The subset of `pks` that are primary keys of `model` rows."
  [model :- :keyword
   pks   :- [:sequential ms/PositiveInt]]
  (let [pk (first (t2/primary-keys model))]
    (into #{} (mdb/select-batched #(t2/select-fn-set pk [model pk] pk [:in [:auto/param %]]) pks))))

(mu/defn root-collections-for-user
  "The top-level non-analytics Collections that are not personal or belong to the User with `user-id`."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Collection {:where [:and [:= :location "/"]
                                        [:or [:= :personal_owner_id nil]
                                         [:= :personal_owner_id user-id]]
                                        [:or [:= :namespace nil]
                                         [:!= :namespace "analytics"]]]}))

(mu/defn analytics-root-collections
  "The Collections in the analytics namespace."
  []
  (t2/select :model/Collection {:where [:= :namespace "analytics"]}))

(mu/defn card-ids-in-collections
  "The subset of `card-ids` living in the Collections with `collection-ids`."
  [card-ids       :- [:sequential ::lib.schema.id/card]
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (mdb/select-batched-set (fn [card-ids]
                            (mdb/select-batched #(t2/select-pks-set :model/Card {:where [:and
                                                                                         [:in :id card-ids]
                                                                                         [:in :collection_id %]]})
                                                collection-ids))
                          card-ids))

(mu/defn data-app-collection-ids :- [:set ::lib.schema.id/collection]
  "The resource Collection ids of the DataApps with `data-app-ids`."
  [data-app-ids :- [:sequential ms/PositiveInt]]
  (if (empty? data-app-ids)
    #{}
    (into #{} (mdb/select-batched #(t2/select-fn-set :resource_collection_id [:model/DataApp :resource_collection_id]
                                                     {:where [:and [:in :id %] [:not= :resource_collection_id nil]]})
                                  data-app-ids))))

(mu/defn archived-collection-ids :- [:set ::lib.schema.id/collection]
  "The subset of `collection-ids` that are archived."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (into #{} (mdb/select-batched #(t2/select-pks-set :model/Collection {:where [:and [:in :id %] [:= :archived true]]})
                                collection-ids)))

(mu/defn rows-for-export
  "A reducible of the rows `model`, a model or a selection of its columns, matching the honey SQL `where` clause, in
  ascending order of `order-columns`."
  [model         :- [:or :keyword vector?]
   where         :- [:maybe vector?]
   order-columns :- [:sequential :keyword]]
  (t2/reducible-select model {:where    where
                              :order-by (mapv (fn [column] [column :asc]) order-columns)}))

(mu/defn entity-id->pk :- [:map-of :string :any]
  "The primary key of each `model` row with one of `entity-ids`, by entity id."
  [model      :- :keyword
   entity-ids :- [:sequential :string]]
  (let [pk (first (t2/primary-keys model))]
    (mdb/select-batched-map #(t2/select-fn->fn :entity_id pk [model pk :entity_id]
                                               :entity_id [:in [:auto/param %]])
                            entity-ids)))

(mu/defn ids-for-export :- [:set :any]
  "The primary keys of the `model` rows matching the honey SQL `where` clause."
  [model :- :keyword
   pk    :- :keyword
   where :- [:maybe vector?]]
  (set (t2/select-fn-set pk [model pk] {:where where})))

(mu/defn collection-subtree-ids :- [:set ::lib.schema.id/collection]
  "The ids of the Collections with `collection-ids` and of their descendants, without archived ones when
  `unarchived-only?`."
  [collection-ids   :- [:sequential ::lib.schema.id/collection]
   unarchived-only? :- :boolean]
  (if (empty? collection-ids)
    #{}
    (into #{} (mdb/select-batched
               (fn [collection-ids]
                 (t2/select-pks-set :model/Collection
                                    {:where [:and
                                             (into [:or [:in :id [:auto/param collection-ids]]]
                                                   (map (fn [id] [:like :location (str "%/" id "/%")]))
                                                   collection-ids)
                                             (when unarchived-only? [:= :archived false])]}))
               collection-ids))))
