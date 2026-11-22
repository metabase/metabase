(ns metabase.pulse.models.pulse-channel-recipient
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as pulse]
   [metabase.users.models.user :as user]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseChannelRecipient [_model] :pulse_channel_recipient)

(derive :model/PulseChannelRecipient :metabase/model)

;;; ------------------------------------------------------ Writes --------------------------------------------------------

(defn- emptied-channel-ids
  "The ids of the PulseChannels that lose their last recipient when `recipients` are deleted, and have no raw email
  addresses. Slack PulseChannels and ones with email address subscriptions are never deleted with their recipients."
  [recipients]
  (when (seq recipients)
    (let [channel-ids (into #{} (map :pulse_channel_id) recipients)
          remaining   (merge (zipmap channel-ids (repeat 0))
                             (pulse.db/pulse-channel-recipient-counts (vec channel-ids)))
          deleting    (frequencies (map :pulse_channel_id recipients))
          candidates  (filterv #(= (get deleting %) (get remaining %)) channel-ids)
          details     (when (seq candidates) (pulse.db/pulse-channel-details-by-ids candidates))]
      (filterv #(empty? (:emails (get details %))) candidates))))

(defn- delete-recipients!
  "Delete the PulseChannelRecipients `recipients`, and the PulseChannels they were the last recipients of, publishing the
  events of the writes with `context`."
  [recipients context]
  (when (seq recipients)
    (t2/with-transaction [_conn]
      (let [emptied   (vec (emptied-channel-ids recipients))
            emptied?  (set emptied)
            remaining (vec (remove (comp emptied? :pulse_channel_id) recipients))]
        (pulse/remove-pulse-channels! emptied context)
        (when (seq remaining)
          (events/publish-event! :event/pulse-channel-recipient-delete (events/delete-event remaining context))
          (pulse.db/delete-pulse-channel-recipients! (mapv :id remaining)))))))

(mu/defn delete-pulse-channel-recipients! :- :nil
  "Delete the PulseChannelRecipients with `recipient-ids`. A PulseChannel that loses its last recipient, and has no raw
  email addresses, is deleted with them, and its Pulse is archived when it was the last PulseChannel of the Pulse."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (when (seq recipient-ids)
    (delete-recipients! (pulse.db/pulse-channel-recipients-by-ids recipient-ids) nil))
  nil)

(mu/defn delete-pulse-channel-recipients-for-users! :- :nil
  "Delete every PulseChannelRecipient of the Users with `user-ids`, and the PulseChannels they were the last recipients
  of, as [[delete-pulse-channel-recipients!]] does, publishing the events of the writes with `context`."
  ([user-ids :- [:sequential ::lib.schema.id/user]]
   (delete-pulse-channel-recipients-for-users! user-ids nil))
  ([user-ids :- [:sequential ::lib.schema.id/user]
    context  :- [:maybe :metabase.events.schema/context]]
   (when (seq user-ids)
     (delete-recipients! (pulse.db/pulse-channel-recipients-for-users user-ids) context))
   nil))

(mu/defn delete-pulse-channel-recipients-for-user! :- :nil
  "Delete every PulseChannelRecipient of the User with `user-id`, as [[delete-pulse-channel-recipients-for-users!]]
  does."
  [user-id :- ::lib.schema.id/user]
  (delete-pulse-channel-recipients-for-users! [user-id]))

(defmethod user/delete-for-users! :model/PulseChannelRecipient
  [_model user-ids context]
  (delete-pulse-channel-recipients-for-users! (vec user-ids) context))

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod app-db-copy/spec :model/PulseChannelRecipient [_model]
  {:skip? false})

(defmethod change-log/spec :model/PulseChannelRecipient [_model]
  {:track [:pulse_channel_id :user_id]
   :skip  []})

(defmethod audit/spec :model/PulseChannelRecipient [_model]
  {:track          []
   :track-redacted [:pulse_channel_id :user_id]
   :skip           []
   :parent         {:model :model/PulseChannel, :key :pulse_channel_id}})
