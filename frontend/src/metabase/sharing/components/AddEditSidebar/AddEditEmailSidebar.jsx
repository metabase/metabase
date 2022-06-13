import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import { PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE } from "metabase/plugins";
import { dashboardPulseIsValid } from "metabase/lib/pulse";

import { CHANNEL_NOUN_PLURAL } from "./constants";
import Icon from "metabase/components/Icon";
import Heading from "./Heading";
import Toggle from "metabase/core/components/Toggle";
import CaveatMessage from "./CaveatMessage";
import ChannelFields from "./ChannelFields";
import SchedulePicker from "metabase/components/SchedulePicker";
import DefaultParametersSection from "./DefaultParametersSection";
import Sidebar from "metabase/dashboard/components/Sidebar";
import EmailAttachmentPicker from "metabase/sharing/components/EmailAttachmentPicker";
import DeleteSubscriptionAction from "./DeleteSubscriptionAction";
import RecipientPicker from "metabase/pulse/components/RecipientPicker";
import SendTestPulse from "metabase/components/SendTestPulse";

function _AddEditEmailSidebar({
  pulse,
  formInput,
  channel,
  channelSpec,
  users,
  parameters,
  defaultParametersById,
  dashboard,

  // form callbacks
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  testPulse,
  toggleSkipIfEmpty,
  setPulse,
  handleArchive,
  setPulseParameters,
}) {
  const isValid = dashboardPulseIsValid(pulse, formInput.channels);

  return (
    <Sidebar
      closeIsDisabled={!isValid}
      onClose={handleSave}
      onCancel={onCancel}
    >
      <div className="pt4 px4 flex align-center">
        <Icon name="mail" className="mr1" size={21} />
        <Heading>{t`Email this dashboard`}</Heading>
      </div>
      <CaveatMessage />
      <div className="my2 px4">
        <div>
          <div className="text-bold mb1">{t`To:`}</div>
          <RecipientPicker
            isNewPulse={pulse.id == null}
            autoFocus={false}
            recipients={channel.recipients}
            recipientTypes={channelSpec.recipients}
            users={users}
            onRecipientsChange={recipients =>
              onChannelPropertyChange("recipients", recipients)
            }
            invalidRecipientText={domains =>
              t`You're only allowed to email subscriptions to addresses ending in ${domains}`
            }
          />
        </div>
        {channelSpec.fields && (
          <ChannelFields
            channel={channel}
            channelSpec={channelSpec}
            onChannelPropertyChange={onChannelPropertyChange}
          />
        )}
        <SchedulePicker
          schedule={_.pick(
            channel,
            "schedule_day",
            "schedule_frame",
            "schedule_hour",
            "schedule_type",
          )}
          scheduleOptions={channelSpec.schedules}
          textBeforeInterval={t`Sent`}
          textBeforeSendTime={t`${CHANNEL_NOUN_PLURAL[
            channelSpec && channelSpec.type
          ] || t`Messages`} will be sent at`}
          onScheduleChange={(newSchedule, changedProp) =>
            onChannelScheduleChange(newSchedule, changedProp)
          }
        />
        <div className="pt2 pb1">
          <SendTestPulse
            channel={channel}
            channelSpecs={formInput.channels}
            pulse={pulse}
            testPulse={testPulse}
            normalText={t`Send email now`}
            successText={t`Email sent`}
            disabled={!isValid}
          />
        </div>
        {PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component ? (
          <PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE.Component
            className="py3 mt2 border-top"
            parameters={parameters}
            dashboard={dashboard}
            pulse={pulse}
            setPulseParameters={setPulseParameters}
            defaultParametersById={defaultParametersById}
          />
        ) : (
          <DefaultParametersSection
            className="py3 mt2 border-top"
            parameters={parameters}
            defaultParametersById={defaultParametersById}
          />
        )}
        <div className="text-bold py3 flex justify-between align-center border-top">
          <Heading>{t`Don't send if there aren't results`}</Heading>
          <Toggle
            value={pulse.skip_if_empty || false}
            onChange={toggleSkipIfEmpty}
          />
        </div>
        <div className="text-bold py2 flex justify-between align-center border-top">
          <div className="flex align-center">
            <Heading>{t`Attach results`}</Heading>
            <Icon
              name="info"
              className="text-medium ml1"
              size={12}
              tooltip={t`Attachments can contain up to 2,000 rows of data.`}
            />
          </div>
        </div>
        <EmailAttachmentPicker
          cards={pulse.cards}
          pulse={pulse}
          setPulse={setPulse}
        />
        {pulse.id != null && (
          <DeleteSubscriptionAction
            pulse={pulse}
            handleArchive={handleArchive}
          />
        )}
      </div>
    </Sidebar>
  );
}

_AddEditEmailSidebar.propTypes = {
  pulse: PropTypes.object,
  formInput: PropTypes.object.isRequired,
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  users: PropTypes.array,
  parameters: PropTypes.array.isRequired,
  defaultParametersById: PropTypes.object.isRequired,
  dashboard: PropTypes.object.isRequired,
  handleSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
  onChannelScheduleChange: PropTypes.func.isRequired,
  testPulse: PropTypes.func.isRequired,
  toggleSkipIfEmpty: PropTypes.func.isRequired,
  setPulse: PropTypes.func.isRequired,
  handleArchive: PropTypes.func.isRequired,
  setPulseParameters: PropTypes.func.isRequired,
};

export default _AddEditEmailSidebar;
