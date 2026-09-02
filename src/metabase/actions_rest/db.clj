(ns metabase.actions-rest.db
  "Application database queries for the actions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [toucan2.core :as t2]))

(defn hydrate-creator
  "Hydrate `:creator` onto `actions`."
  [actions]
  (t2/hydrate actions :creator))

(defn unarchived-models-in-collections
  "The unarchived model Cards matching the Honey SQL `collection-clause`."
  [collection-clause]
  (t2/select :model/Card {:where [:and
                                  [:= :type "model"]
                                  [:= :archived false]
                                  collection-clause]}))

(defn public-actions
  "The name, id, public uuid, and model id of the unarchived Actions that are publicly shared."
  []
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(defn delete-action!
  "Delete the Action with `action-id`."
  [action-id]
  (t2/delete! :model/Action :id action-id))

(defn database
  "The Database with `database-id`, or nil."
  [database-id]
  (t2/select-one :model/Database :id database-id))

(defn set-action-public-uuid!
  "Set the public uuid of the Action with `action-id` and the User who made it public."
  [action-id public-uuid made-public-by-id]
  (t2/update! :model/Action action-id {:public_uuid public-uuid, :made_public_by_id made-public-by-id}))
