/* eslint "react/prop-types": "error" */

import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import _ from "underscore";
import { t, ngettext, msgid } from "ttag";
import { Flex } from "grid-styled";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Subhead from "metabase/components/type/Subhead";
import Sidebar from "metabase/dashboard/components/Sidebar";
import Tooltip from "metabase/components/Tooltip";

import { formatHourAMPM, formatDay, formatFrame } from "metabase/lib/time";
import { getActivePulseParameters } from "metabase/lib/pulse";

import { getParameters } from "metabase/dashboard/selectors";

const mapStateToProps = (state, props) => {
  return {
    parameters: getParameters(state, props),
  };
};

export const PulsesListSidebar = connect(mapStateToProps)(_PulsesListSidebar);

function _PulsesListSidebar({
  pulses,
  createSubscription,
  onCancel,
  editPulse,
  parameters,
}) {
  return (
    <Sidebar>
      <div className="px4 pt3 flex justify-between align-center">
        <Subhead>{t`Subscriptions`}</Subhead>

        <Flex align="center">
          <Tooltip tooltip={t`Set up a new schedule`}>
            <Icon
              name="add"
              className="text-brand bg-light-hover rounded p1 cursor-pointer mr1"
              size={18}
              onClick={createSubscription}
            />
          </Tooltip>
          <Tooltip tooltip={t`Close`}>
            <Icon
              name="close"
              className="text-light bg-light-hover rounded p1 cursor-pointer"
              size={22}
              onClick={onCancel}
            />
          </Tooltip>
        </Flex>
      </div>
      <div className="my2 mx4">
        {pulses.map(pulse => (
          <Card
            key={pulse.id}
            flat
            className="mb3 cursor-pointer bg-brand-hover"
            onClick={() => editPulse(pulse, pulse.channels[0].channel_type)}
          >
            <div className="px3 py2 hover-parent hover--inherit text-white-hover">
              <div className="flex align-center hover-child hover--inherit">
                <Icon
                  name={
                    pulse.channels[0].channel_type === "email"
                      ? "mail"
                      : "slack"
                  }
                  className="mr1"
                  style={{ paddingBottom: "5px" }}
                  size={16}
                />
                <Label className="hover-child hover--inherit">
                  {friendlySchedule(pulse.channels[0])}
                </Label>
              </div>
              <PulseDetails pulse={pulse} parameters={parameters} />
            </div>
          </Card>
        ))}
      </div>
    </Sidebar>
  );
}

_PulsesListSidebar.propTypes = {
  pulses: PropTypes.array.isRequired,
  createSubscription: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  editPulse: PropTypes.func.isRequired,
  parameters: PropTypes.array.isRequired,
};

function buildRecipientText(pulse) {
  const {
    channels: [firstChannel],
  } = pulse;
  if (firstChannel.channel_type !== "email") {
    return "";
  }

  const [firstRecipient, ...otherRecipients] = firstChannel.recipients;
  const firstRecipientText = firstRecipient.common_name || firstRecipient.email;
  return _.isEmpty(otherRecipients)
    ? firstRecipientText
    : `${firstRecipientText} ${ngettext(
        msgid`and ${otherRecipients.length} other`,
        `and ${otherRecipients.length} others`,
        otherRecipients.length,
      )}`;
}

function buildFilterText(pulse, parameters) {
  const activeParameters = getActivePulseParameters(pulse, parameters);

  if (_.isEmpty(activeParameters)) {
    return "";
  }

  const [firstParameter, ...otherParameters] = activeParameters;
  const numValues = [].concat(firstParameter.value).length;
  const firstFilterText = `${firstParameter.name} is ${
    numValues > 1 ? t`${numValues} selections` : firstParameter.value
  }`;

  return _.isEmpty(otherParameters)
    ? firstFilterText
    : `${firstFilterText} ${ngettext(
        msgid`and ${otherParameters.length} more filter`,
        `and ${otherParameters.length} more filters`,
        otherParameters.length,
      )}`;
}

function PulseDetails({ pulse, parameters }) {
  const recipientText = buildRecipientText(pulse);
  const filterText = buildFilterText(pulse, parameters);

  return (
    <div className="text-medium hover-child">
      <ul
        className="flex flex-column scroll-x scroll-y text-unspaced"
        style={{ maxHeight: 130 }}
      >
        {recipientText && (
          <li className="flex align-start mr1 text-bold text-medium hover-child hover--inherit">
            <Icon
              name="group"
              className="text-medium hover-child hover--inherit"
              size={12}
            />
            <span
              className="ml1 text-medium hover-child hover--inherit"
              style={{ fontSize: "12px" }}
            >
              {recipientText}
            </span>
          </li>
        )}
        {filterText && (
          <li className="flex align-start mt1 mr1 text-bold text-medium hover-child hover--inherit">
            <Icon
              name="filter"
              className="text-medium hover-child hover--inherit"
              size={12}
            />
            <span
              className="ml1 text-medium hover-child hover--inherit"
              style={{ fontSize: "12px" }}
            >
              {filterText}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

PulseDetails.propTypes = {
  pulse: PropTypes.object.isRequired,
  parameters: PropTypes.array.isRequired,
};

function friendlySchedule(channel) {
  let scheduleString = "";
  if (channel.channel_type === "email") {
    scheduleString += t`Emailed `;
  } else if (channel.channel_type === "slack") {
    scheduleString += t`Sent to ` + channel.details.channel + " ";
  } else {
    scheduleString += t`Sent `;
  }

  switch (channel.schedule_type) {
    case "hourly":
      scheduleString += t`hourly`;
      break;
    case "daily": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      scheduleString += t`daily at ${ampm}`;
      break;
    }
    case "weekly": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      const day = formatDay(channel.schedule_day);
      scheduleString += t`${day} at ${ampm}`;
      break;
    }
    case "monthly": {
      const ampm = formatHourAMPM(channel.schedule_hour);
      const day = formatDay(channel.schedule_day);
      const frame = formatFrame(channel.schedule_frame);
      scheduleString += t`monthly on the ${frame} ${day} at ${ampm}`;
      break;
    }
    default:
      scheduleString += channel.schedule_type;
  }

  return scheduleString;
}

export default PulsesListSidebar;
