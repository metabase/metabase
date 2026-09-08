(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn all-users :- [:sequential ::users.schema/user]
  "Every User."
  []
  (t2/select :model/User))

(mu/defn collection-id-row :- [:maybe :map]
  "The `:collection_id` row of the instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one [model :collection_id] :id id))

(mu/defn existing-ids :- [:maybe [:set ms/PositiveInt]]
  "The subset of `ids` for which an instance of `model` exists."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pks-set model {:where [:in :id ids]}))

(mu/defn instance-exists? :- :boolean
  "Whether an instance of `model` whose primary key is `id` exists."
  [model :- :keyword
   id    :- [:maybe ms/PositiveInt]]
  (t2/exists? model (first (t2/primary-keys model)) id))

(mu/defn root-collections-for-user :- [:sequential ::collections.schema/collection]
  "The top-level non-analytics Collections that are not personal or belong to the User with `user-id`."
  [user-id :- [:maybe ::lib.schema.id/user]]
  (t2/select :model/Collection {:where [:and [:= :location "/"]
                                        [:or [:= :personal_owner_id nil]
                                         [:= :personal_owner_id user-id]]
                                        [:or [:= :namespace nil]
                                         [:!= :namespace "analytics"]]]}))

(mu/defn analytics-root-collections :- [:sequential ::collections.schema/collection]
  "The Collections in the analytics namespace."
  []
  (t2/select :model/Collection {:where [:= :namespace "analytics"]}))

(mu/defn card-ids-in-collections :- [:maybe [:set ::lib.schema.id/card]]
  "The subset of `card-ids` living in the Collections with `collection-ids`."
  [card-ids       :- [:sequential ::lib.schema.id/card]
   collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:in :id card-ids]
                                          [:in :collection_id collection-ids]]}))
