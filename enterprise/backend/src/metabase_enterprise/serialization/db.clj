(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
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

(mu/defn layout-collections
  "The `:id`, `:entity_id`, `:name`, `:location`, `:namespace`, `:type` and `:created_at` of every Collection."
  []
  (t2/select [:model/Collection :id :entity_id :name :location :namespace :type :created_at]))

(mu/defn data-app-slugs-by-collection-id
  "The slug (the `:name`) of each DataApp, keyed by the id of its resource collection."
  []
  (t2/select-fn->fn :resource_collection_id :name :model/DataApp {:where [:not= :resource_collection_id nil]}))

(mu/defn layout-rows
  "The `columns` of every instance of `model` that matches the HoneySQL `where` clause, or of every instance when it
  is nil."
  [model   :- :keyword
   columns :- [:sequential :keyword]
   where   :- [:maybe vector?]]
  (t2/select (into [model] columns) (cond-> {} where (assoc :where where))))

(mu/defn published-tables
  "The `:id`, `:name`, `:schema`, `:db_id`, `:collection_id` and `:created_at` of every published Table, with its
  user settings applied."
  []
  (t2/select [:model/Table :t.id :t.name :t.schema :t.db_id :t.collection_id :t.created_at]
             {:from  [(warehouse-schema-overlay/table-query {:alias :t})]
              :where [:= :t.is_published true]}))

(mu/defn database-names-by-id
  "The `:name` of every Database, keyed by its id."
  []
  (t2/select-pk->fn :name :model/Database))
