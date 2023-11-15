(ns metabase.models.subscription-channel-recipient
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SubscriptionChannelRecipient [_model] :subscription_channel_recipient)

(derive :model/SubscriptionChannelRecipient :metabase/model)

;;; Deletes `SubscriptionChannel` if the recipient being deleted is its last recipient. (This only applies
;;; to SubscriptionChannels with User subscriptions; Slack SubscriptionChannels and ones with email address subscriptions are not
;;; automatically deleted.
(t2/define-before-delete :model/SubscriptionChannelRecipient
  [{channel-id :subscription_channel_id subscription-channel-recipient-id :id}]
  (let [other-recipients-count (t2/count :model/SubscriptionChannelRecipient
                                         :subscription_channel_id channel-id
                                         :id                      [:not= subscription-channel-recipient-id])
        last-recipient?        (zero? other-recipients-count)]
    (when last-recipient?
      ;; make sure this channel doesn't have any email-address (non-User) recipients.
      (let [details              (t2/select-one-fn :details :model/SubscriptionChannel :id channel-id)
            has-email-addresses? (seq (:emails details))]
        (when-not has-email-addresses?
          (t2/delete! :model/SubscriptionChannel :id channel-id))))))
