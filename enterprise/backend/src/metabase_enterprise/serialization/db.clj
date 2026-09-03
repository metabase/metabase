(ns metabase-enterprise.serialization.db
  "Application database queries for the serialization module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model-level helpers."
  (:require
   [toucan2.core :as t2]))

(defn all-users
  "Every User."
  []
  (t2/select :model/User))

(defn collection-id-row
  "The `:collection_id` row of the instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one [model :collection_id] :id id))

(defn existing-ids
  "The subset of `ids` for which an instance of `model` exists."
  [model ids]
  (t2/select-pks-set model {:where [:in :id ids]}))

(defn instance-exists?
  "Whether an instance of `model` whose primary key is `id` exists."
  [model id]
  (t2/exists? model (first (t2/primary-keys model)) id))

(defn root-collections-for-user
  "The top-level non-analytics Collections that are not personal or belong to the User with `user-id`."
  [user-id]
  (t2/select :model/Collection {:where [:and [:= :location "/"]
                                        [:or [:= :personal_owner_id nil]
                                         [:= :personal_owner_id user-id]]
                                        [:or [:= :namespace nil]
                                         [:!= :namespace "analytics"]]]}))

(defn analytics-root-collections
  "The Collections in the analytics namespace."
  []
  (t2/select :model/Collection {:where [:= :namespace "analytics"]}))

(defn card-ids-in-collections
  "The subset of `card-ids` living in the Collections with `collection-ids`."
  [card-ids collection-ids]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:in :id card-ids]
                                          [:in :collection_id collection-ids]]}))
