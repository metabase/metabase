(ns metabase.session.events.revoke-on-deactivation
  "End a user's sessions when they are deactivated, so a later reactivation can't revive a pre-deactivation session
   cookie. (SEC-863)"
  (:require
   [metabase.events.core :as events]
   [metabase.session.models.session :as session]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]))

(events/derive! ::event :metabase/event)
(events/derive! :event/user-update ::event)

(methodical/defmethod events/publish-event! ::event
  [_topic {:keys [changes user-id]}]
  (when-let [user-ids (not-empty (into []
                                       (comp (filter #(and (false? (:is_active (:object %)))
                                                           (u.events/changed? % :is_active)))
                                             (map (comp :id :object)))
                                       changes))]
    (session/end-sessions! {:user_id user-ids} "user-deactivated" user-id)))
