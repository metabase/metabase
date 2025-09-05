(ns metabase-enterprise.comments.api
  "`/api/ee/comment/` routes"
  (:require
   [metabase-enterprise.comments.models.comment-reaction :as m.comment-reaction]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
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

(defn- can-write-entity?
  "Check if current user can write to the entity being commented on"
  [target-type target-id]
  (case target-type
    "document" (try
                 (let [entity (t2/select-one :model/Document :id target-id)]
                   (api/read-check entity)
                   (mi/can-write? entity))
                 (catch Exception _ false))
    false))

(defn- entity-archived?
  "Check if the target entity is archived"
  [target-type target-id]
  (case target-type
    "document" (t2/select-one-fn :archived [:model/Document :archived] :id target-id)
    false))

(defn- render-comments
  "Process comments to prepare them for the world:
  - remove/scrub deleted comments
  - render reactions with limited amount of users"
  [comments]
  (let [has-replies?     (into #{} (map :parent_comment_id comments))
        delete-comment   (fn [c]
                           (cond
                             (not (:deleted_at c))        c
                             (not (has-replies? (:id c))) nil
                             ;; if comment has replies, we scrub it
                             :else                        (assoc c :content {})))
        render-reactions (fn [c]
                           (update c :reactions (fn [emoji-map]
                                                  (vec (for [[emoji users] emoji-map]
                                                         {:emoji emoji
                                                          :count (count users)
                                                          :users (take 10 users)})))))]
    (into [] (comp (map render-reactions) (keep delete-comment)) comments)))

(api.macros/defendpoint :get "/"
  "Get comments for an entity"
  [_route-params
   {:keys [target_type target_id]} :- [:map
                                       [:target_type [:enum "document"]]
                                       [:target_id ms/PositiveInt]]]
  (api/check-403 (can-read-entity? target_type target_id))

  (let [comments (-> (t2/select :model/Comment
                                {:where    [:and
                                            [:= :target_type target_type]
                                            [:= :target_id target_id]]
                                 :order-by [[:created_at :asc]]})
                     (t2/hydrate :creator :reactions))]
    {:comments (render-comments comments)}))

;;; schemas

(def CommentContent
  "Validation for comment content - expects JSON"
  (mu/with-api-error-message
   [:and
    {:error/message "Comment content must be valid JSON"
     :json-schema   {:type "object"}}
    [:map]]
   (deferred-tru "Comment content must be valid JSON.")))

(def CreateComment
  "Schema for creating a new comment"
  [:map
   [:target_type [:enum "document"]]
   [:target_id   ms/PositiveInt]
   [:content     CommentContent]
   [:child_target_id {:optional true} [:maybe :string]]
   [:parent_comment_id {:optional true} [:maybe ms/PositiveInt]]])

(def UpdateComment
  "Schema for updating a comment"
  [:map
   [:content {:optional true} CommentContent]
   [:is_resolved {:optional true} :boolean]])

;;; routes

(api.macros/defendpoint :post "/"
  "Create a new comment"
  [_route-params
   _query-params
   {:keys [target_type target_id child_target_id parent_comment_id content]} :- CreateComment]
  (api/check-403 (can-read-entity? target_type target_id))
  (api/check-400 (not (entity-archived? target_type target_id))
                 "Cannot comment on archived entities")

  ;; If this is a reply, validate the parent comment exists and belongs to same entity
  (when parent_comment_id
    (let [parent (api/check-404 (t2/select-one :model/Comment :id parent_comment_id))]
      (api/check-400 (and (= (:target_type parent) target_type)
                          (= (:target_id parent) target_id)
                          (= (:child_target_id parent) child_target_id))
                     "Parent comment doesn't belong to the same entity")))

  (let [comment (t2/insert-returning-instance! :model/Comment
                                               {:target_type       target_type
                                                :target_id         target_id
                                                :child_target_id   child_target_id
                                                :parent_comment_id parent_comment_id
                                                :content           content
                                                :creator_id        api/*current-user-id*})]
    (-> comment
        (t2/hydrate :creator)
        ;; New comments always have empty reactions map
        (assoc :reactions []))))

(api.macros/defendpoint :put "/:comment-id"
  "Update a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [content is_resolved]} :- UpdateComment]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    ;; Check if target entity is archived - makes comments read-only
    (api/check-400 (not (entity-archived? (:target_type comment) (:target_id comment)))
                   "Cannot edit comments on archived entities")

    ;; Check permissions based on what's being updated
    (when content
      ;; Cannot edit content of deleted comments
      (api/check-400 (not (:deleted_at comment))
                     "Cannot edit content of a deleted comment")
      ;; Only creator or admin can edit comment content
      (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                         (:is_superuser @api/*current-user*))))

    (when (some? is_resolved)
      ;; Anyone with write permission to target entity can resolve/unresolve
      (api/check-403 (or (can-write-entity? (:target_type comment) (:target_id comment))
                         (:is_superuser @api/*current-user*))))

    (when-let [updates (-> {:content content :is_resolved is_resolved}
                           u/remove-nils
                           not-empty)]
      (t2/update! :model/Comment comment-id updates))

    (-> (t2/select-one :model/Comment :id comment-id)
        (t2/hydrate :creator :reactions))))

(api.macros/defendpoint :delete "/:comment-id"
  "Soft delete a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    ;; Check if target entity is archived - makes comments read-only
    (api/check-400 (not (entity-archived? (:target_type comment) (:target_id comment)))
                   "Cannot delete comments on archived entities")

    ;; Only creator or admin can delete comments
    (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                       (:is_superuser @api/*current-user*)))

    (when (:deleted_at comment)
      (api/check-400 false "Comment is already deleted"))

    ;; Soft delete the comment
    (t2/update! :model/Comment comment-id {:deleted_at [:now]})

    ;; Return 204 No Content
    api/generic-204-no-content))

(api.macros/defendpoint :post "/:comment-id/reaction"
  "Toggle a reaction on a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [emoji]} :- [:map [:emoji [:string {:min 1 :max 10}]]]]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    ;; Check if user can read the target entity
    (api/check-403 (can-read-entity? (:target_type comment) (:target_id comment)))

    ;; Cannot react to deleted comments
    (api/check-400 (not (:deleted_at comment))
                   "Cannot react to deleted comments")

    ;; Cannot react to comments on archived entities
    (api/check-400 (not (entity-archived? (:target_type comment) (:target_id comment)))
                   "Cannot react to comments on archived entities")

    ;; Toggle the reaction
    (m.comment-reaction/toggle-reaction comment-id api/*current-user-id* emoji)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/comment/` routes."
  (api.macros/ns-handler *ns* +auth))
