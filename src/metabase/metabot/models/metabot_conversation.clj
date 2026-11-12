(ns metabase.metabot.models.metabot-conversation
  (:require
   [metabase.api.common :as api]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotConversation [_model] :metabot_conversation)

(doto :model/MetabotConversation
  (derive :metabase/model))

(t2/define-after-select :model/MetabotConversation
  [conversation]
  (when-let [user-id api/*current-user-id*]
    (mi/register-pending! [::participant user-id] (:id conversation)))
  conversation)

(defn participant?
  "True if `user-id` has sent at least one message in `conversation-id`, looked up with the other conversations the
  request loaded."
  [conversation-id user-id]
  (when (and conversation-id user-id)
    (mi/batched-lookup [::participant user-id] conversation-id
                       #(zipmap (metabot.db/conversation-ids-with-message-from user-id %) (repeat true)))))

(defmethod mi/can-read? :model/MetabotConversation
  ;; Access: superuser, or originator (first-writer, set on insert and never
  ;; overwritten), or participant. Originator covers the rare case of a row
  ;; existing without the originator's first message yet persisted.
  ([{conversation-id :id originator-id :user_id}]
   (let [user-id api/*current-user-id*]
     (or api/*is-superuser?*
         (and conversation-id
              user-id
              (or (= originator-id user-id)
                  (participant? conversation-id user-id))))))
  ([_model pk]
   (when-let [instance (metabot.db/conversation-id-and-user-id pk)]
     (mi/can-read? instance))))

(methodical/defmethod t2/batched-hydrate [:model/MetabotConversation :user]
  "Batch-hydrate `:user` (id/email/name only) — semantically the *originator*.
  Name kept as `:user` for compatibility with existing EE analytics responses."
  [_model k conversations]
  (mi/instances-with-hydrated-data
   conversations k
   #(metabot.db/user-summaries-by-id (keep :user_id conversations))
   :user_id {:default nil}))
