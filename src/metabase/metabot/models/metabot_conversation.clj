(ns metabase.metabot.models.metabot-conversation
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/MetabotConversation [_model] :metabot_conversation)

(doto :model/MetabotConversation
  (derive :metabase/model))

(t2/deftransforms :model/MetabotConversation
  {:state mi/transform-json})

(defn participant?
  "True if `user-id` has sent at least one message in `conversation-id`."
  [conversation-id user-id]
  (when (and conversation-id user-id)
    (t2/exists? :model/MetabotMessage
                :conversation_id conversation-id
                :user_id         user-id)))

(defmethod mi/can-read? :model/MetabotConversation
  ;; Access: superuser, or originator (first-writer, set on insert and never
  ;; overwritten), or participant. Originator covers the rare case of a row
  ;; existing without the originator's first message yet persisted.
  ([instance]
   (or api/*is-superuser?*
       (= (:user_id instance) api/*current-user-id*)
       (participant? (:id instance) api/*current-user-id*)))
  ([_model pk]
   (when-let [instance (t2/select-one [:model/MetabotConversation :id :user_id] :id pk)]
     (mi/can-read? instance))))

(methodical/defmethod t2/batched-hydrate [:model/MetabotConversation :user]
  "Batch-hydrate `:user` (id/email/name only) — semantically the *originator*.
  Name kept as `:user` for compatibility with existing EE analytics responses."
  [_model k conversations]
  (mi/instances-with-hydrated-data
   conversations k
   #(t2/select-pk->fn (fn [u] (select-keys u [:id :email :first_name :last_name]))
                      [:model/User :id :email :first_name :last_name]
                      :id (keep :user_id conversations))
   :user_id {:default nil}))
