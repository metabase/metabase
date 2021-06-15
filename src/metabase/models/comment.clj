(ns metabase.models.comment
  (:require [metabase.models.interface :as i]
            [metabase.models.notification :as notification]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def commented-item-types
  "Schema enum of the acceptable values for the `commented_item_type` column"
  (s/enum "moderation_request" "moderation_review"))

(def commented-item->model
  "Maps DB name of the commented item type to the model symbol (used for db/select and such)"
  {"moderation_request" 'ModerationRequest
   :moderation_request  'ModerationRequest
   "moderation_review"  'ModerationReview
   :moderation_review   'ModerationReview})

(defn- commented-item
  [{:keys [commented_item_id commented_item_type]}]
  (db/select-one (commented-item->model commented_item_type) :id commented_item_id))

(defn- author-for
  [{:keys [moderator_id requester_id]}]
  (or moderator_id requester_id))

(defn- create-notifications!
  [{:keys [commented_item_id commented_item_type author_id id] :as comment}]
  (u/prog1 comment
    (let [user-ids (disj (set (conj (db/select-field :author_id 'Comment
                                      :commented_item_type (name commented_item_type)
                                      :commented_item_id commented_item_id)
                                    (author-for (commented-item comment))))
                         author_id)]
      (notification/create-notifications!
       (map (fn [user-id] {:notifier_id id
                           :notifier_type "comment"
                           :user_id user-id})
            user-ids)))))

(models/defmodel Comment :comment)

(u/strict-extend (class Comment)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:commented_item_type :keyword})
          :post-insert create-notifications!})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)


(s/defn create-comment!
  "Create a new Comment"
  [params :-
   {:commented_item_id   su/IntGreaterThanZero
    :commented_item_type commented-item-types
    :author_id           su/IntGreaterThanZero
    :text                s/Str}]
  (db/insert! Comment params))

(s/defn update-comment!
  "Update the text of the Comment with the given `:id`"
  [c :-
   {:id   su/IntGreaterThanZero
    :text (s/maybe s/Str)}]
  (when (db/update! Comment (u/the-id c) (dissoc c :id))
    (Comment (u/the-id c))))
