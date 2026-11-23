(ns metabase.metabot.models.metabot-conversation
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.events :as u.events]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/MetabotConversation [_model] :metabot_conversation)

(doto :model/MetabotConversation
  (derive :metabase/model))

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

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-metabot-conversations! :- [:sequential ::metabot.schema/metabot-conversation]
  "Insert the MetabotConversation `rows`, each under its client-generated `:id`, and return them in order, publishing
  the event of the write."
  [rows :- [:sequential ::metabot.schema/metabot-conversation.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (u/prog1 (metabot.db/insert-conversations! rows)
        (events/publish-event! :event/metabot-conversation-create (events/create-event <>))))))

(mu/defn upsert-metabot-conversation!
  "Insert the MetabotConversation with `conversation-id` for the User `user-id` with the `columns`, or when it exists
  set those of `columns` it has no value for; its `:user_id` is never overwritten."
  [conversation-id :- :string
   user-id         :- [:maybe ::lib.schema.id/user]
   columns         :- (mut/dissoc ::metabot.schema/metabot-conversation.update :user_id)]
  (mdb/with-conflict-retry
    (t2/with-transaction [_conn]
      (if-let [existing (metabot.db/conversation conversation-id)]
        (let [changes (into {} (filter (fn [[k _]] (nil? (get existing k)))) columns)]
          (metabot.db/update-conversation! conversation-id changes)
          (events/publish-event! :event/metabot-conversation-update
                                 (events/update-event {(:id existing) existing} [(assoc changes :id (:id existing))])))
        (let [created (metabot.db/insert-upserted-conversation! conversation-id (assoc columns :user_id user-id))]
          (events/publish-event! :event/metabot-conversation-create (events/create-event [created]))))
      conversation-id)))

(mu/defn set-metabot-conversation-title-if-missing! :- :int
  "Set the title of the MetabotConversation with `conversation-id` when it has none, returning the number of rows
  updated."
  [conversation-id :- :string
   title           :- :string]
  (t2/with-transaction [_conn]
    (if-let [previous (metabot.db/titleless-conversation conversation-id)]
      (let [changes {:title title}]
        (metabot.db/update-conversation! conversation-id changes)
        (events/publish-event! :event/metabot-conversation-update
                               (events/update-event {(:id previous) previous} [(assoc changes :id (:id previous))]))
        1)
      0)))

(defn- delete-conversation-rows!
  "Delete the MetabotConversation `rows`, publish their delete, and return how many there were."
  [rows]
  (when (seq rows)
    (events/publish-event! :event/metabot-conversation-delete {:changes (u.events/delete-changes rows) :user-id (mi/current-user-id)})
    (metabot.db/delete-conversations! (mapv :id rows)))
  (count rows))

(mu/defn delete-metabot-conversations-for-cleanup!
  "Delete the MetabotConversations created before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/with-transaction [_conn]
    (delete-conversation-rows! (metabot.db/conversations-created-before cutoff))))

(mu/defn seed-metabot-conversation!
  "Insert the MetabotConversation `row` as given, its id and timestamps included, which the testing API seeds."
  [row :- ::metabot.schema/metabot-conversation]
  (t2/with-transaction [_conn]
    (u/prog1 (metabot.db/insert-conversation-row! row)
      (events/publish-event! :event/metabot-conversation-create (events/create-event [<>])))))

(mu/defn delete-metabot-conversations!
  "Delete the MetabotConversations with `conversation-ids`."
  [conversation-ids :- [:sequential :string]]
  (t2/with-transaction [_conn]
    (delete-conversation-rows! (metabot.db/conversations-by-ids conversation-ids))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/MetabotConversation [_model]
  {:skip?    false
   :sequence false})
