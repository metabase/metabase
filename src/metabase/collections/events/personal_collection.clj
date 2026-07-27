(ns metabase.collections.events.personal-collection
  "Creates a User's Personal Collection as soon as the User row is inserted."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.util :as u]
   [methodical.core :as methodical]))

(derive ::event :metabase/event)
(derive :event/user-create ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {user :object}]
  (collection/user->personal-collection (u/the-id user)))
