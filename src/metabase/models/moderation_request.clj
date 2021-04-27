(ns metabase.models.moderation-request
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel ModerationRequest :moderation_request)
(u/strict-extend (class ModerationRequest)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)

#_(defn add-moderated-items
  {:batched-hydrate :moderated_item}
  [requests]
  (moderation/add-moderated-items requests))
