(ns metabase.actions-rest.db
  "Application database queries for the actions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [malli.util :as mut]
   [metabase.actions.schema :as actions.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn unarchived-models-visible-to-user :- [:sequential ::queries.schema/card]
  "The unarchived model Cards in Collections the current user can read."
  []
  (t2/select :model/Card {:where [:and
                                  [:= :type "model"]
                                  [:= :archived false]
                                  (collection/visible-collection-filter-clause)]}))

(mu/defn public-actions :- [:sequential (mut/select-keys ::actions.schema/action [:name :id :public_uuid :model_id])]
  "The name, id, public uuid, and model id of the unarchived Actions that are publicly shared."
  []
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(mu/defn delete-action! :- :int
  "Delete the Action with `action-id`."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/Action :id action-id))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn set-action-public-uuid! :- :int
  "Set the public uuid of the Action with `action-id` and the User who made it public."
  [action-id         :- ::lib.schema.id/action
   public-uuid       :- [:maybe :string]
   made-public-by-id :- [:maybe ::lib.schema.id/user]]
  (t2/update! :model/Action action-id {:public_uuid public-uuid, :made_public_by_id made-public-by-id}))
