/* eslint "react/prop-types": "error" */

import PropTypes from "prop-types";
import cx from "classnames";
import { connect } from "react-redux";
import _ from "underscore";
import { t, ngettext, msgid } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Label from "metabase/components/type/Label";
import Subhead from "metabase/components/type/Subhead";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import Tooltip from "metabase/core/components/Tooltip";

import {
  formatDateTimeWithUnit,
  formatTimeWithUnit,
} from "metabase/lib/formatting";
import { formatFrame } from "metabase/lib/time";
import { getActivePulseParameters } from "metabase/lib/pulse";

import { getParameters } from "metabase/dashboard/selectors";
import { PulseCard, SidebarActions } from "./PulsesListSidebar.styled";

const mapStateToProps = (state, props) => {
  return {
    parameters: getParameters(state, props),
  };
};

export const PulsesListSidebar = connect(mapStateToProps)(_PulsesListSidebar);

function _PulsesListSidebar({
  pulses,
  formInput,
  createSubscription,
  onCancel,
  editPulse,
  parameters,
}) {
  return (
    <Sidebar>
      <div className="px4 pt3 flex justify-between align-center">
        <Subhead>{t`Subscriptions`}</Subhead>

        <SidebarActions>
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
        </SidebarActions>
      </div>
      <div className="my2 mx4">
        {pulses.map(pulse => {
          const canEdit = canEditPulse(pulse, formInput);

          return (
            <PulseCard
              aria-label="Pulse Card"
              key={pulse.id}
              flat
              canEdit={canEdit}
              onClick={() =>
                canEdit && editPulse(pulse, pulse.channels[0].channel_type)
              }
            >
              <div
                className={cx("px3 py2 hover-parent hover--inherit", {
                  "text-white-hover": canEdit,
                })}
              >
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
            </PulseCard>
          );
        })}
      </div>
    </Sidebar>
  );
}

_PulsesListSidebar.propTypes = {
  pulses: PropTypes.array.isRequired,
  formInput: PropTypes.object.isRequired,
  createSubscription: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  editPulse: PropTypes.func.isRequired,
  parameters: PropTypes.array.isRequired,
};

function canEditPulse(pulse, formInput) {
  switch (pulse.channels[0].channel_type) {
    case "email":
      return formInput.channels.email != null;
    case "slack":
      return formInput.channels.slack != null;
  }
}

function buildRecipientText(pulse) {
  const {
    channels: [firstChannel],
  } = pulse;

  const { channel_type, recipients } = firstChannel;

  if (channel_type !== "email" || _.isEmpty(recipients)) {
    return "";
  }

  const [firstRecipient, ...otherRecipients] = recipients;
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
  const {
    channel_type,
    details,
    schedule_day,
    schedule_frame,
    schedule_hour,
    schedule_type,
  } = channel;

  let scheduleString = "";

  if (channel_type === "email") {
    scheduleString += t`Emailed `;
  } else if (channel_type === "slack") {
    scheduleString += t`Sent to ` + details.channel + " ";
  } else {
    scheduleString += t`Sent `;
  }

  switch (schedule_type) {
    case "hourly":
      scheduleString += t`hourly`;
      break;
    case "daily": {
      const hour = formatTimeWithUnit(schedule_hour, "hour-of-day");
      scheduleString += t`daily at ${hour}`;
      break;
    }
    case "weekly": {
      const hour = formatTimeWithUnit(schedule_hour, "hour-of-day");
      const day = formatDateTimeWithUnit(schedule_day, "day-of-week");
      scheduleString += t`${day} at ${hour}`;
      break;
    }
    case "monthly": {
      const hour = formatTimeWithUnit(schedule_hour, "hour-of-day");
      const day = schedule_day
        ? formatDateTimeWithUnit(schedule_day, "day-of-week")
        : "calendar day";
      const frame = formatFrame(schedule_frame);
      scheduleString += t`monthly on the ${frame} ${day} at ${hour}`;
      break;
    }
    default:
      scheduleString += schedule_type;
  }

  return scheduleString;
}

export default PulsesListSidebar;
