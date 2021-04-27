(ns metabase.models.moderation-review
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel ModerationReview :moderation_review)

(u/strict-extend (class ModerationReview)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)
