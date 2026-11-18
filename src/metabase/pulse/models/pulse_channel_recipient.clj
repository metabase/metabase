(ns metabase.pulse.models.pulse-channel-recipient
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.pulse.db :as pulse.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseChannelRecipient [_model] :pulse_channel_recipient)

(derive :model/PulseChannelRecipient :metabase/model)
(derive :model/PulseChannelRecipient :hook/events)

(defmethod events/spec :model/PulseChannelRecipient
  [_model]
  {:create :event/pulse-channel-recipient-create
   :update :event/pulse-channel-recipient-update
   :delete :event/pulse-channel-recipient-delete})

(defmethod change-log/spec :model/PulseChannelRecipient [_model]
  {:track [:pulse_channel_id :user_id]
   :skip  []})

(defmethod app-db-copy/spec :model/PulseChannelRecipient [_model]
  {:skip? false})

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

;;; Deletes `PulseChannel` if the recipient being deleted is its last recipient. (This only applies
;;; to PulseChannels with User subscriptions; Slack PulseChannels and ones with email address subscriptions are not
;;; automatically deleted.
(t2/define-before-delete :model/PulseChannelRecipient
  [{channel-id :pulse_channel_id, pulse-channel-recipient-id :id}]
  (let [other-recipients-count (pulse.db/other-pulse-channel-recipient-count channel-id pulse-channel-recipient-id)
        last-recipient?        (zero? other-recipients-count)]
    (when last-recipient?
      ;; make sure this channel doesn't have any email-address (non-User) recipients.
      (let [details              (pulse.db/pulse-channel-details channel-id)
            has-email-addresses? (seq (:emails details))]
        (when-not has-email-addresses?
          (pulse.db/delete-pulse-channel! channel-id))))))
