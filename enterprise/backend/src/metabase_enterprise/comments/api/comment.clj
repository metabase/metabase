(ns metabase-enterprise.comments.api.comment
  "`/api/ee/comment/` routes"
  (:require
   [metabase-enterprise.comments.models.comment :as m.comment]
   [metabase-enterprise.comments.models.comment-reaction :as m.comment-reaction]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.models.interface :as mi]
   [metabase.util.json :as json]
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
    "document" (let [entity (t2/select-one :model/Document :id target-id)]
                 (:archived entity))
    false))

(defn- decode-comment-content
  "Decode JSON content, handling both old text format and new JSON format"
  [content]
  (cond
    (nil? content) nil
    (string? content) (try
                        (json/decode content true)
                        (catch Exception _
                          ;; If it fails to parse, assume it's old plain text format
                          {:text content}))
    :else content))

(defn- process-deleted-comments
  "Process comments to handle soft-deleted ones with threading logic.
   - Remove deleted comments that have no replies
   - Replace deleted comments that have replies with placeholder content"
  [comments]
  (let [comment-map (into {} (map #(vector (:id %) %) comments))
        has-replies? #(some (fn [c] (= (:parent_comment_id c) %)) (vals comment-map))]
    (->> comments
         (map (fn [comment]
                (let [decoded-comment (update comment :content decode-comment-content)]
                  (if (and (:is_deleted comment) (has-replies? (:id comment)))
                    ;; Replace deleted comment content with empty JSON if it has replies
                    (assoc decoded-comment
                           :content {})
                    decoded-comment))))
         ;; Remove deleted comments that have no replies
         (remove #(and (:is_deleted %) (not (has-replies? (:id %))))))))

(defn- hydrate-reactions
  "Add reactions to comments"
  [comments current-user-id]
  (if (seq comments)
    (let [comment-ids (map :id comments)
          reactions-map (m.comment-reaction/get-reactions-for-comments comment-ids current-user-id)]
      (map (fn [comment]
             (assoc comment :reactions (get reactions-map (:id comment) [])))
           comments))
    comments))

(api.macros/defendpoint :get "/"
  "Get comments for an entity"
  [_route-params
   {:keys [target_type target_id]} :- [:map
                                      [:target_type [:enum "document"]]
                                      [:target_id ms/PositiveInt]]]
  (api/check-403 (can-read-entity? target_type target_id))

  (let [all-comments (t2/hydrate
                      (t2/select :model/Comment
                                {:where [:and
                                        [:= :target_type target_type]
                                        [:= :target_id target_id]]
                                 :order-by [[:created_at :asc]]})
                      :creator)
        processed-comments (process-deleted-comments all-comments)
        comments-with-reactions (hydrate-reactions processed-comments api/*current-user-id*)]
    {:comments comments-with-reactions}))

(api.macros/defendpoint :post "/"
  "Create a new comment"
  [_route-params
   _query-params
   {:keys [target_type target_id child_target_id parent_comment_id content]} :- m.comment/CreateComment]
  (api/check-403 (can-read-entity? target_type target_id))
  (api/check-400 (not (entity-archived? target_type target_id))
                 "Cannot comment on archived entities")

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
                                            :content (json/encode content)
                                            :creator_id api/*current-user-id*})]
    (let [new-comment (t2/hydrate (t2/select-one :model/Comment :id comment-id) :creator)
          comment-with-content (update new-comment :content decode-comment-content)]
      ;; New comments always have empty reactions array
      (assoc comment-with-content :reactions []))))

(api.macros/defendpoint :put "/:comment-id"
  "Update a comment"
  [{:keys [comment-id]} :- [:map [:comment-id ms/PositiveInt]]
   _query-params
   {:keys [content is_resolved]} :- m.comment/UpdateComment]
  (let [comment (api/check-404 (t2/select-one :model/Comment :id comment-id))]
    ;; Check if target entity is archived - makes comments read-only
    (api/check-400 (not (entity-archived? (:target_type comment) (:target_id comment)))
                   "Cannot edit comments on archived entities")

    ;; Check permissions based on what's being updated
    (when content
      ;; Cannot edit content of deleted comments
      (api/check-400 (not (:is_deleted comment))
                     "Cannot edit content of a deleted comment")
      ;; Only creator or admin can edit comment content
      (api/check-403 (or (= (:creator_id comment) api/*current-user-id*)
                          (:is_superuser @api/*current-user*))))

    (when (some? is_resolved)
      ;; Anyone with write permission to target entity can resolve/unresolve
      (api/check-403 (or (can-write-entity? (:target_type comment) (:target_id comment))
                          (:is_superuser @api/*current-user*))))

    (let [updates (cond-> {}
                    content (assoc :content (json/encode content))
                    (some? is_resolved) (assoc :is_resolved is_resolved))]
      (when (seq updates)
        (t2/update! :model/Comment comment-id updates)))

    (let [updated-comment (t2/hydrate (t2/select-one :model/Comment :id comment-id) :creator)
          comment-with-content (update updated-comment :content decode-comment-content)
          ;; Include current reactions in response
          reactions-map (m.comment-reaction/get-reactions-for-comments [comment-id] api/*current-user-id*)]
      (assoc comment-with-content :reactions (get reactions-map comment-id [])))))

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

    (when (:is_deleted comment)
      (api/check-400 false "Comment is already deleted"))

    ;; Soft delete the comment
    (t2/update! :model/Comment comment-id {:is_deleted true})

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
    (api/check-400 (not (:is_deleted comment))
                   "Cannot react to deleted comments")

    ;; Cannot react to comments on archived entities
    (api/check-400 (not (entity-archived? (:target_type comment) (:target_id comment)))
                   "Cannot react to comments on archived entities")

    ;; Toggle the reaction
    (m.comment-reaction/toggle-reaction comment-id api/*current-user-id* emoji)))




(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/comment/` routes."
  (api.macros/ns-handler *ns* +auth))
