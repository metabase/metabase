(ns metabase.pulse.models.pulse-channel-recipient
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.pulse.db :as pulse.db]
   [metabase.pulse.models.pulse :as pulse]
   [metabase.pulse.schema :as pulse.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseChannelRecipient [_model] :pulse_channel_recipient)

(derive :model/PulseChannelRecipient :metabase/model)
(derive :model/PulseChannelRecipient :hook/events)

;;; ------------------------------------------------------ Writes --------------------------------------------------------

(defn- emptied-channel-ids
  "The ids of the PulseChannels that lose their last recipient when `recipients` are deleted, and have no raw email
  addresses. Slack PulseChannels and ones with email address subscriptions are never deleted with their recipients."
  [recipients]
  (when (seq recipients)
    (let [channel-ids (into #{} (map :pulse_channel_id) recipients)
          remaining   (merge (zipmap channel-ids (repeat 0))
                             (pulse.db/pulse-channel-recipient-counts (vec channel-ids)))
          deleting    (frequencies (map :pulse_channel_id recipients))]
      (for [channel-id channel-ids
            :when      (and (= (get deleting channel-id) (get remaining channel-id))
                            (empty? (:emails (pulse.db/pulse-channel-details channel-id))))]
        channel-id))))

(defn- delete-recipients!
  "Delete the PulseChannelRecipients `recipients`, and the PulseChannels they were the last recipients of."
  [recipients]
  (when (seq recipients)
    (pulse/remove-pulse-channels! (vec (emptied-channel-ids recipients)))
    (pulse.db/delete-pulse-channel-recipients! (mapv :id recipients))))

(mu/defn create-pulse-channel-recipients!
  "Insert the PulseChannelRecipient `rows`."
  [rows :- [:sequential ::pulse.schema/pulse-channel-recipient.create]]
  (pulse.db/insert-pulse-channel-recipients! rows))

(mu/defn delete-pulse-channel-recipients!
  "Delete the PulseChannelRecipients with `recipient-ids`. A PulseChannel that loses its last recipient, and has no raw
  email addresses, is deleted with them, and its Pulse is archived when it was the last PulseChannel of the Pulse."
  [recipient-ids :- [:sequential ms/PositiveInt]]
  (when (seq recipient-ids)
    (delete-recipients! (pulse.db/pulse-channel-recipients-by-ids recipient-ids))))

(mu/defn delete-pulse-channel-recipients-for-user!
  "Delete every PulseChannelRecipient of the User with `user-id`, and the PulseChannels it was the last recipient of,
  as [[delete-pulse-channel-recipients!]] does."
  [user-id :- ::lib.schema.id/user]
  (delete-recipients! (pulse.db/pulse-channel-recipients-for-user user-id)))

;;; ------------------------------------------------------- Specs --------------------------------------------------------

(defmethod events/spec :model/PulseChannelRecipient
  [_model]
  {:create :event/pulse-channel-recipient-create
   :update :event/pulse-channel-recipient-update
   :delete :event/pulse-channel-recipient-delete})

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
