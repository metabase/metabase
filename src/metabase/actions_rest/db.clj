(ns metabase.actions-rest.db
  "Application database queries for the actions REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.actions.schema :as actions.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn action-ids-visible-to-user
  "The ids of the Actions that are `:archived` or not, of the model `:model-id`, or else in Collections the current
  user can read or in the data actions root without a model, limited to actions of `:type` if given."
  [{action-type :type, model-id :model-id, :keys [archived]} :- [:map {:closed true}
                                                                 [:type     {:optional true} [:maybe ::actions.schema/type]]
                                                                 [:model-id {:optional true} [:maybe ::lib.schema.id/card]]
                                                                 [:archived :boolean]]]
  (t2/select-pks-vec :model/Action {:where [:and
                                            [:= :archived archived]
                                            (when action-type
                                              [:= :type (name action-type)])
                                            (if model-id
                                              [:= :model_id model-id]
                                              [:or
                                               [:and
                                                [:not= :model_id nil]
                                                (collection/visible-collection-filter-clause
                                                 :collection_id
                                                 {:include-archived-items (if archived :all :exclude)
                                                  :root-namespace         nil})]
                                               [:and
                                                [:= :model_id nil]
                                                (collection/visible-collection-filter-clause
                                                 :collection_id
                                                 {:include-archived-items (if archived :all :exclude)
                                                  :root-namespace         collection/data-actions-ns})]])]}))

(mu/defn public-actions
  "The name, id, public uuid, and model id of the unarchived Actions that are publicly shared."
  []
  (t2/select [:model/Action :name :id :public_uuid :model_id], :public_uuid [:not= nil], :archived false))

(mu/defn delete-action!
  "Delete the Action with `action-id`."
  [action-id :- ::lib.schema.id/action]
  (t2/delete! :model/Action :id action-id))

(mu/defn database
  "The Database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id))

(mu/defn set-action-public-uuid!
  "Set the public uuid of the Action with `action-id` and the User who made it public."
  [action-id         :- ::lib.schema.id/action
   public-uuid       :- [:maybe :string]
   made-public-by-id :- [:maybe ::lib.schema.id/user]]
  (t2/update! :model/Action action-id {:public_uuid public-uuid, :made_public_by_id made-public-by-id}))
