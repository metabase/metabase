(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
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
  (t2/select-pks-set model {:where [:in :id ids]}))

(mu/defn instance-exists?
  "Whether an instance of `model` whose primary key is `id` exists."
  [model :- :keyword
   id    :- [:maybe ms/PositiveInt]]
  (t2/exists? model (first (t2/primary-keys model)) id))

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
  (t2/select-pks-set :model/Card {:where [:and
                                          [:in :id card-ids]
                                          [:in :collection_id collection-ids]]}))

(mu/defn data-app-collection-ids :- [:set ::lib.schema.id/collection]
  "The resource Collection ids of the DataApps with `data-app-ids`."
  [data-app-ids :- [:sequential ms/PositiveInt]]
  (if (empty? data-app-ids)
    #{}
    (t2/select-fn-set :resource_collection_id [:model/DataApp :resource_collection_id]
                      {:where [:and [:in :id data-app-ids] [:not= :resource_collection_id nil]]})))

(mu/defn archived-collection-ids :- [:set ::lib.schema.id/collection]
  "The subset of `collection-ids` that are archived."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (set (t2/select-pks-set :model/Collection {:where [:and [:in :id collection-ids] [:= :archived true]]})))

(mu/defn rows-for-export
  "A reducible of the rows `model`, a model or a selection of its columns, matching the honey SQL `where` clause, in
  ascending order of `order-columns`."
  [model         :- [:or :keyword vector?]
   where         :- [:maybe vector?]
   order-columns :- [:sequential :keyword]]
  (t2/reducible-select model {:where    where
                              :order-by (mapv (fn [column] [column :asc]) order-columns)}))

(mu/defn entity-pk
  "The primary key of the `model` row with `entity-id`, or nil."
  [model     :- :keyword
   entity-id :- :string]
  (let [pk (first (t2/primary-keys model))]
    (t2/select-one-fn pk [model pk] :entity_id entity-id)))

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
    (set (t2/select-pks-set :model/Collection
                            {:where [:and
                                     (into [:or [:in :id [:auto/param collection-ids]]]
                                           (map (fn [id] [:like :location (str "%/" id "/%")]))
                                           collection-ids)
                                     (when unarchived-only? [:= :archived false])]}))))
