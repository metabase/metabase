(ns metabase.models.timeline-event
  (:require [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel TimelineEvent :timeline_event)

(u/strict-extend (class TimelineEvent)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true})})

  ;; todo: need correct the following to follow collection id of the timeline, the parent of the current timeline
  ;; event

  ;; i/IObjectPermissions
  ;; perms/IObjectPermissionsForParentCollection
  )
