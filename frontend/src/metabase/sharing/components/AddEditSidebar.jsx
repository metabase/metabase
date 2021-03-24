/* eslint "react/prop-types": "error" */

import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t, jt, ngettext, msgid } from "ttag";

import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import EmailAttachmentPicker from "metabase/sharing/components/EmailAttachmentPicker";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Text from "metabase/components/type/Text";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import RecipientPicker from "metabase/pulse/components/RecipientPicker";
import SchedulePicker from "metabase/components/SchedulePicker";
import SendTestEmail from "metabase/components/SendTestEmail";
import Sidebar from "metabase/dashboard/components/Sidebar";
import Toggle from "metabase/components/Toggle";
import Select, { Option } from "metabase/components/Select";

import { dashboardPulseIsValid } from "metabase/lib/pulse";
import MetabaseSettings from "metabase/lib/settings";

const Heading = ({ children }) => <h4>{children}</h4>;
Heading.propTypes = { children: PropTypes.any };

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const CHANNEL_NOUN_PLURAL = {
  email: t`Emails`,
  slack: t`Slack messages`,
};

export function AddEditEmailSidebar({
  pulse,
  formInput,
  channel,
  channelSpec,
  users,

  // form callbacks
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  testPulse,
  toggleSkipIfEmpty,
  setPulse,
  handleArchive,
}) {
  return (
    <Sidebar
      onClose={handleSave}
      onCancel={onCancel}
      className="text-dark"
      closeIsDisabled={!dashboardPulseIsValid(pulse, formInput.channels)}
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
          <SendTestEmail
            channel={channel}
            pulse={pulse}
            testPulse={testPulse}
          />
        </div>
        <div className="text-bold py3 mt2 flex justify-between align-center border-top">
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

AddEditEmailSidebar.propTypes = {
  pulse: PropTypes.object.isRequired,
  formInput: PropTypes.object.isRequired,
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  users: PropTypes.array,
  handleSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
  onChannelScheduleChange: PropTypes.func.isRequired,
  testPulse: PropTypes.func.isRequired,
  toggleSkipIfEmpty: PropTypes.func.isRequired,
  setPulse: PropTypes.func.isRequired,
  handleArchive: PropTypes.func.isRequired,
};

function DeleteSubscriptionAction({ pulse, handleArchive }) {
  return pulse.id != null && !pulse.archived ? (
    <div className="border-top pt1 pb3 flex justify-end">
      <ModalWithTrigger
        triggerClasses="Button Button--borderless text-light text-error-hover flex-align-right flex-no-shrink"
        triggerElement={t`Delete this subscription`}
      >
        {({ onClose }) => (
          <DeleteModalWithConfirm
            objectType="pulse"
            title={t`Delete this subscription to ${pulse.name}?`}
            buttonText={t`Delete`}
            confirmItems={getConfirmItems(pulse)}
            onClose={onClose}
            onDelete={handleArchive}
          />
        )}
      </ModalWithTrigger>
    </div>
  ) : null;
}

DeleteSubscriptionAction.propTypes = {
  pulse: PropTypes.object.isRequired,
  handleArchive: PropTypes.func.isRequired,
};

function getConfirmItems(pulse) {
  return pulse.channels.map((c, index) =>
    c.channel_type === "email" ? (
      <span key={index}>
        {jt`This dashboard will no longer be emailed to ${(
          <strong key="msg">
            {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
              c.recipients.length,
            )}
          </strong>
        )} ${<strong key="type">{c.schedule_type}</strong>}`}
        .
      </span>
    ) : c.channel_type === "slack" ? (
      <span key={index}>
        {jt`Slack channel ${(
          <strong key="msg">{c.details && c.details.channel}</strong>
        )} will no longer get this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ) : (
      <span key={index}>
        {jt`Channel ${(
          <strong key="msg">{c.channel_type}</strong>
        )} will no longer receive this dashboard ${(
          <strong key="type">{c.schedule_type}</strong>
        )}`}
        .
      </span>
    ),
  );
}

export function AddEditSlackSidebar({
  pulse,
  formInput,
  channel,
  channelSpec,

  // form callbacks
  handleSave,
  onCancel,
  onChannelPropertyChange,
  onChannelScheduleChange,
  toggleSkipIfEmpty,
  handleArchive,
}) {
  return (
    <Sidebar
      onClose={handleSave}
      onCancel={onCancel}
      className="text-dark"
      closeIsDisabled={!dashboardPulseIsValid(pulse, formInput.channels)}
    >
      <div className="pt4 flex align-center px4 mb3">
        <Icon name="slack" className="mr1" size={21} />
        <Heading>{t`Send this dashboard to Slack`}</Heading>
      </div>
      <CaveatMessage />
      <div className="pb2 px4">
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
        <div className="text-bold py2 mt2 flex justify-between align-center border-top">
          <Heading>{t`Don't send if there aren't results`}</Heading>
          <Toggle
            value={pulse.skip_if_empty || false}
            onChange={toggleSkipIfEmpty}
          />
        </div>
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

AddEditSlackSidebar.propTypes = {
  pulse: PropTypes.object.isRequired,
  formInput: PropTypes.object.isRequired,
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  users: PropTypes.array,
  handleSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
  onChannelScheduleChange: PropTypes.func.isRequired,
  toggleSkipIfEmpty: PropTypes.func.isRequired,
  handleArchive: PropTypes.func.isRequired,
};

function CaveatMessage() {
  return (
    <Text className="mx4 my2 p2 bg-light text-dark rounded">
      <span className="text-bold">{t`Note`}:</span>
      {t`charts in your subscription won't look the same as in your dashboard.`}
      &nbsp;
      <ExternalLink
        className="link"
        target="_blank"
        href={MetabaseSettings.docsUrl("users-guide/dashboard-subscriptions")}
      >
        {t`Learn more`}
      </ExternalLink>
      .
    </Text>
  );
}

function ChannelFields({ channel, channelSpec, onChannelPropertyChange }) {
  const valueForField = field => {
    const value = channel.details && channel.details[field.name];
    return value != null ? value : null; // convert undefined to null so Uncontrollable doesn't ignore changes
  };
  return (
    <div>
      {channelSpec.fields.map(field => (
        <div key={field.name} className={field.name}>
          <span className="text-bold mr1">{field.displayName}</span>
          {field.type === "select" ? (
            <Select
              className="text-bold bg-white inline-block"
              value={valueForField(field)}
              placeholder={t`Pick a user or channel...`}
              searchProp="name"
              // Address #5799 where `details` object is missing for some reason
              onChange={o =>
                onChannelPropertyChange("details", {
                  ...channel.details,
                  [field.name]: o.target.value,
                })
              }
            >
              {field.options.map(option => (
                <Option key={option} name={option} value={option}>
                  {option}
                </Option>
              ))}
            </Select>
          ) : null}
        </div>
      ))}
    </div>
  );
}

ChannelFields.propTypes = {
  channel: PropTypes.object.isRequired,
  channelSpec: PropTypes.object.isRequired,
  onChannelPropertyChange: PropTypes.func.isRequired,
};
