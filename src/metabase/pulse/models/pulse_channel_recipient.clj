(ns metabase.pulse.models.pulse-channel-recipient
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.change-log.core :as change-log]
   [metabase.events.core :as events]
   [metabase.pulse.write]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------- Setup --------------------------------------------------------

(methodical/defmethod t2/table-name :model/PulseChannelRecipient [_model] :pulse_channel_recipient)

(derive :model/PulseChannelRecipient :metabase/model)

;;; ------------------------------------------------------- Hooks --------------------------------------------------------

(t2/define-after-insert :model/PulseChannelRecipient
  [recipient]
  (events/created! :model/PulseChannelRecipient recipient)
  recipient)

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
