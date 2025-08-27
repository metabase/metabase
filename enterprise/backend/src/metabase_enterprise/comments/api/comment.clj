(ns metabase-enterprise.comments.api.comment
  "`/api/ee/comment/` routes"
  (:require
   [metabase-enterprise.comments.models.comment :as m.comment]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- can-read-entity?
  "Check if current user can read the entity being commented on"
  [target-type target-id]
  (case target-type
    "document" (try
                 (api/read-check (t2/select-one :model/Document :id target-id))
                 true
                 (catch Exception _ false))
    false))

(api.macros/defendpoint :get "/"
  "Get comments for an entity"
  [_route-params
   {:keys [target_type target_id]} :- [:map
                                      [:target_type [:enum "document"]]
                                      [:target_id ms/PositiveInt]]]
  (api/check-403 (can-read-entity? target_type target_id))

  {:comments (t2/hydrate
              (t2/select :model/Comment
                        {:where [:and
                                [:= :target_type target_type]
                                [:= :target_id target_id]
                                [:= :is_deleted false]]
                         :order-by [[:created_at :asc]]})
              :creator)})

(api.macros/defendpoint :post "/"
  "Create a new comment"
  [_route-params
   _query-params
   {:keys [target_type target_id child_target_id parent_comment_id content]} :- m.comment/CreateComment]
  (api/check-403 (can-read-entity? target_type target_id))

  ;; If this is a reply, validate the parent comment exists and belongs to same entity
  (when parent_comment_id
    (let [parent (api/check-404 (t2/select-one :model/Comment :id parent_comment_id))]
      (api/check-400 (and (= (:target_type parent) target_type)
                          (= (:target_id parent) target_id))
                     "Parent comment doesn't belong to the same entity")))

  (let [comment-id (t2/insert-returning-pk! :model/Comment
                                           {:target_type target_type
                                            :target_id target_id
                                            :child_target_id child_target_id
                                            :parent_comment_id parent_comment_id
                                            :content content
                                            :creator_id api/*current-user-id*})]
    (t2/hydrate (t2/select-one :model/Comment :id comment-id) :creator)))

(api.macros/defendpoint :put "/:comment-id"
  "Update a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [content is_resolved]} :- m.comment/UpdateComment]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    ;; Only creator or admin can edit comments
    (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                       (:is_superuser @api/*current-user*)))

    (api/check-400 (not (:is_deleted comment))
                   "Cannot edit a deleted comment")

    (let [updates (cond-> {}
                    content (assoc :content content)
                    (some? is_resolved) (assoc :is_resolved is_resolved))]
      (when (seq updates)
        (t2/update! :model/Comment comment-id updates)))

    (t2/hydrate (t2/select-one :model/Comment :id comment-id) :creator)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/comment/` routes."
  (api.macros/ns-handler *ns* +auth))
