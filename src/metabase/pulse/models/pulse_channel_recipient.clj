(ns metabase.pulse.models.pulse-channel-recipient
  (:require
   [metabase.pulse.db :as pulse.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/PulseChannelRecipient [_model] :pulse_channel_recipient)

(derive :model/PulseChannelRecipient :metabase/model)

;;; Deletes `PulseChannel` if the recipient being deleted is its last recipient. (This only applies
;;; to PulseChannels with User subscriptions; Slack PulseChannels and ones with email address subscriptions are not
;;; automatically deleted.
(t2/define-before-delete :model/PulseChannelRecipient
  [{channel-id :pulse_channel_id, pulse-channel-recipient-id :id}]
  (let [other-recipients-count (pulse.db/count-other-pulse-channel-recipients channel-id pulse-channel-recipient-id)
        last-recipient?        (zero? other-recipients-count)]
    (when last-recipient?
      ;; make sure this channel doesn't have any email-address (non-User) recipients.
      (let [details              (:details (pulse.db/select-one-pulse-channel {:id channel-id :columns [:details]}))
            has-email-addresses? (seq (:emails details))]
        (when-not has-email-addresses?
          (pulse.db/delete-pulse-channels! {:id channel-id}))))))
