(ns metabase.metabot.models.metabot-conversation
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotConversation [_model] :metabot_conversation)

(doto :model/MetabotConversation
  (derive :metabase/model)
  (derive :hook/events))

(defmethod events/spec :model/MetabotConversation
  [_model]
  {:create :event/metabot-conversation-create
   :update :event/metabot-conversation-update
   :delete :event/metabot-conversation-delete})

(defmethod app-db-copy/spec :model/MetabotConversation [_model]
  {:skip?    false
   :sequence false})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/MetabotConversation
  [row]
  (when (contains? (t2/changes row) :user_id)
    (throw (ex-info (tru "You cannot change the originator of a conversation.") {:status-code 400})))
  row)

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/MetabotConversation :can_read]
  "Whether the current user reads each of `conversations`: a superuser reads every one, any other user the ones they
  originated or sent a message in. The originator covers a row whose first message is not persisted yet."
  [_model k conversations]
  (let [user-id      api/*current-user-id*
        participated (when (and user-id (not api/*is-superuser?*))
                       (metabot.db/participated-conversation-ids (into [] (keep :id) conversations) user-id))]
    (for [{conversation-id :id originator-id :user_id :as conversation} conversations]
      (when conversation
        (vary-meta conversation assoc k
                   (boolean
                    (or api/*is-superuser?*
                        (and conversation-id
                             user-id
                             (or (= originator-id user-id)
                                 (contains? participated conversation-id))))))))))

(methodical/defmethod t2/simple-hydrate [:model/MetabotConversation :can_write]
  "Whether the current user forks `conversation`: only its originator does."
  [_model k {originator-id :user_id :as conversation}]
  (assoc conversation k (boolean (and originator-id (= originator-id api/*current-user-id*)))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/MetabotConversation :user]
  "Batch-hydrate `:user` (id/email/name only) — semantically the *originator*.
  Name kept as `:user` for compatibility with existing EE analytics responses."
  [_model k conversations]
  (mi/instances-with-hydrated-data
   conversations k
   #(metabot.db/user-summaries-by-id (keep :user_id conversations))
   :user_id {:default nil}))
