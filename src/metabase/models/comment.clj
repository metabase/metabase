(ns metabase.models.comment
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def commented-item-types
  "Schema enum of the acceptable values for the `commented_item_type` column"
  (s/enum "moderation_request" "moderation_review"))

(models/defmodel Comment :comment)

(u/strict-extend (class Comment)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:commented_item_type :keyword})})

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
