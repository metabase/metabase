(ns metabase.transforms-rest.api.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.i18n :refer [deferred-tru LocalizedString]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TransformTagResponse
  [:map {:closed true}
   [:id pos-int?]
   [:name [:or :string LocalizedString]]
   [:entity_id [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:built_in_type {:optional true} [:maybe :string]]
   [:worktree_id {:optional true} [:maybe pos-int?]]
   [:can_run {:optional true} :boolean]])

(api.macros/defendpoint :post "/" :- TransformTagResponse
  "Create a new transform tag. Pass `worktree_id` to create it inside a remote-sync worktree, which is
  admin-only; tag names are unique within a worktree rather than across the instance."
  [_route-params
   _query-params
   {:keys [name worktree_id]} :- [:map
                                  [:name ms/NonBlankString]
                                  [:worktree_id {:optional true} [:maybe ms/PositiveInt]]]]
  (log/info "Creating transform tag")
  (remote-sync/check-worktree-exists! worktree_id)
  (api/check-403 (mi/can-create? :model/TransformTag {:name name :worktree_id worktree_id}))
  (api/check-400 (not (transforms.core/tag-name-exists? name worktree_id))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (t2/insert-returning-instance! :model/TransformTag {:name name :worktree_id worktree_id}))

(api.macros/defendpoint :put "/:tag-id" :- TransformTagResponse
  "Update a transform tag."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]
   _query-params
   {:keys [name]} :- [:map
                      [:name ms/NonBlankString]]]
  (log/info "Updating transform tag" tag-id)
  (api/write-check (t2/select-one :model/TransformTag :id tag-id))
  (api/check-400 (not (transforms.core/tag-name-exists-excluding? name tag-id))
                 (deferred-tru "A tag with the name ''{0}'' already exists." name))
  (t2/update! :model/TransformTag tag-id {:name name})
  (t2/select-one :model/TransformTag :id tag-id))

(api.macros/defendpoint :delete "/:tag-id" :- :nil
  "Delete a transform tag. Removes it from all transforms and jobs."
  [{:keys [tag-id]} :- [:map
                        [:tag-id ms/PositiveInt]]]
  (log/info "Deleting transform tag" tag-id)
  (api/write-check (t2/select-one :model/TransformTag :id tag-id))
  (t2/delete! :model/TransformTag :id tag-id)
  nil)

(api.macros/defendpoint :get "/" :- [:sequential TransformTagResponse]
  "Get a list of the transform tags the current user can read. Tags checked out into a remote-sync worktree are
  left out unless a single worktree's tags are requested via `worktree-id`, which returns *only* that worktree's
  tags and is admin-only."
  [_route-params
   {:keys [worktree-id]} :- [:map [:worktree-id {:optional true} [:maybe ms/PositiveInt]]]]
  (log/info "Getting all transform tags")
  (api/check-data-analyst)
  (when worktree-id
    (api/check-superuser))
  (-> (t2/select :model/TransformTag :worktree_id worktree-id {:order-by [[:name :asc]]})
      (->> (filterv mi/can-read?))
      (t2/hydrate :can_run)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-tag` routes."
  (api.macros/ns-handler *ns* +auth))
