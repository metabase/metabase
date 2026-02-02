import cx from "classnames";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { Label } from "metabase/common/components/type/Label";
import { Subhead } from "metabase/common/components/type/Subhead";
import CS from "metabase/css/core/index.css";
import { Sidebar } from "metabase/dashboard/components/Sidebar";
import { getParameters } from "metabase/dashboard/selectors";
import {
  conjunct,
  formatDateTimeWithUnit,
  formatTimeWithUnit,
} from "metabase/lib/formatting";
import { getActivePulseParameters } from "metabase/lib/pulse";
import { connect } from "metabase/lib/redux";
import { formatFrame } from "metabase/lib/time-dayjs";
import { formatDateValue } from "metabase/parameters/utils/date-formatting";
import { Button, Icon, Tooltip } from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  Channel,
  ChannelApiResponse,
  ChannelType,
  DashboardSubscription,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { PulseCard, SidebarActions } from "./PulsesListSidebar.styled";

type PulsesListSidebarOwnProps = {
  pulses: DashboardSubscription[];
  formInput: ChannelApiResponse;
  createSubscription: () => void;
  onCancel: () => void;
  editPulse: (pulse: DashboardSubscription, channelType: ChannelType) => void;
};

type PulsesListSidebarStateProps = {
  parameters: UiParameter[];
};

type PulsesListSidebarProps = PulsesListSidebarOwnProps &
  PulsesListSidebarStateProps;

const mapStateToProps = (state: State): PulsesListSidebarStateProps => {
  return {
    parameters: getParameters(state),
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
}: PulsesListSidebarProps) {
  const createSubscriptionLabel = t`Set up a new schedule`;
  const closeSidebarLabel = t`Close`;
  return (
    <Sidebar>
      <div
        className={cx(
          CS.px4,
          CS.pt3,
          CS.flex,
          CS.justifyBetween,
          CS.alignCenter,
        )}
      >
        <Subhead>{t`Subscriptions`}</Subhead>

        <SidebarActions>
          <Tooltip label={createSubscriptionLabel}>
            <Button
              aria-label={createSubscriptionLabel}
              leftSection={<Icon name="add" size={16} />}
              variant="subtle"
              mr="1rem"
              onClick={createSubscription}
            />
          </Tooltip>

          <Tooltip label={closeSidebarLabel}>
            <Button
              aria-label={closeSidebarLabel}
              leftSection={<Icon name="close" size={16} />}
              variant="subtle"
              color="text-secondary"
              mr="-1rem"
              onClick={onCancel}
            />
          </Tooltip>
        </SidebarActions>
      </div>
      <div className={cx(CS.my2, CS.mx4)}>
        {pulses.map((pulse) => {
          const canEdit = canEditPulse(pulse, formInput);

          return (
            <PulseCard
              aria-label="Pulse Card"
              key={pulse.id}
              flat
              canEdit={canEdit}
              onClick={() =>
                canEdit &&
                editPulse(pulse, pulse.channels[0].channel_type as ChannelType)
              }
            >
              <div
                className={cx(CS.px3, CS.py2, CS.hoverParent, CS.hoverInherit, {
                  [CS.textWhiteHover]: canEdit,
                })}
              >
                <div
                  className={cx(
                    CS.flex,
                    CS.alignCenter,
                    CS.hoverChild,
                    CS.hoverInherit,
                  )}
                >
                  <Icon
                    name={
                      pulse.channels[0].channel_type === "email"
                        ? "mail"
                        : "slack"
                    }
                    className={CS.mr1}
                    style={{ paddingBottom: "5px" }}
                    size={16}
                  />
                  <Label className={cx(CS.hoverChild, CS.hoverInherit)}>
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

function canEditPulse(
  pulse: DashboardSubscription,
  formInput: ChannelApiResponse,
): boolean {
  switch (pulse.channels[0].channel_type) {
    case "email":
      return formInput.channels.email != null;
    case "slack":
      return formInput.channels.slack != null;
    default:
      return false;
  }
}

function buildRecipientText(pulse: DashboardSubscription): string {
  const {
    channels: [firstChannel],
  } = pulse;

  const { channel_type, recipients } = firstChannel;

  if (channel_type !== "email" || _.isEmpty(recipients)) {
    return "";
  }

  const [firstRecipient, ...otherRecipients] = recipients!;
  const firstRecipientText = firstRecipient.common_name || firstRecipient.email;
  return _.isEmpty(otherRecipients)
    ? firstRecipientText
    : `${firstRecipientText} ${ngettext(
        msgid`and ${otherRecipients.length} other`,
        `and ${otherRecipients.length} others`,
        otherRecipients.length,
      )}`;
}

function buildFilterText(
  pulse: DashboardSubscription,
  parameters: UiParameter[],
): string {
  const activeParameters = getActivePulseParameters(pulse, parameters);

  if (_.isEmpty(activeParameters)) {
    return "";
  }

  const [firstParameter, ...otherParameters] = activeParameters;

  // Format the first parameter value using the same logic as DefaultParametersSection
  let formattedValue;
  if (firstParameter.type && firstParameter.type.startsWith("date/")) {
    const values = Array.isArray(firstParameter.value)
      ? firstParameter.value
      : [firstParameter.value];
    const formattedValues = values
      .map((val: string) => formatDateValue(firstParameter, val))
      .filter(Boolean);
    if (formattedValues.length > 0) {
      formattedValue = conjunct(formattedValues, t`and`);
    } else {
      formattedValue = firstParameter.value;
    }
  } else {
    const values = Array.isArray(firstParameter.value)
      ? firstParameter.value
      : [firstParameter.value];
    formattedValue =
      values.length > 1
        ? t`${values.length} selections`
        : conjunct(values, t`and`);
  }

  const firstFilterText = `${firstParameter.name}: ${formattedValue}`;

  return _.isEmpty(otherParameters)
    ? firstFilterText
    : `${firstFilterText} ${ngettext(
        msgid`and ${otherParameters.length} more filter`,
        `and ${otherParameters.length} more filters`,
        otherParameters.length,
      )}`;
}

type PulseDetailsProps = {
  pulse: DashboardSubscription;
  parameters: UiParameter[];
};

function PulseDetails({ pulse, parameters }: PulseDetailsProps) {
  const recipientText = buildRecipientText(pulse);
  const filterText = buildFilterText(pulse, parameters);

  return (
    <div className={cx(CS.textMedium, CS.hoverChild)}>
      <ul
        className={cx(
          CS.flex,
          CS.flexColumn,
          CS.scrollX,
          CS.scrollY,
          CS.textUnspaced,
        )}
        style={{ maxHeight: 130 }}
      >
        {recipientText && (
          <li
            className={cx(
              CS.flex,
              CS.alignStart,
              CS.mr1,
              CS.textBold,
              CS.textMedium,
              CS.hoverChild,
              CS.hoverInherit,
            )}
          >
            <Icon
              name="group"
              className={cx(CS.textMedium, CS.hoverChild, CS.hoverInherit)}
              size={12}
            />
            <span
              className={cx(
                CS.ml1,
                CS.textMedium,
                CS.hoverChild,
                CS.hoverInherit,
              )}
              style={{ fontSize: "12px" }}
            >
              {recipientText}
            </span>
          </li>
        )}
        {filterText && (
          <li
            className={cx(
              CS.flex,
              CS.alignStart,
              CS.mt1,
              CS.mr1,
              CS.textBold,
              CS.textMedium,
              CS.hoverChild,
              CS.hoverInherit,
            )}
          >
            <Icon
              name="filter"
              className={cx(CS.textMedium, CS.hoverChild, CS.hoverInherit)}
              size={12}
            />
            <span
              className={cx(
                CS.ml1,
                CS.textMedium,
                CS.hoverChild,
                CS.hoverInherit,
              )}
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

function friendlySchedule(channel: Channel): string {
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
    scheduleString += t`Sent to ` + details?.channel + " ";
  } else {
    scheduleString += t`Sent `;
  }

  switch (schedule_type) {
    case "hourly":
      scheduleString += t`hourly`;
      break;
    case "daily": {
      const hour = formatTimeWithUnit(schedule_hour ?? 0, "hour-of-day");
      scheduleString += t`daily at ${hour}`;
      break;
    }
    case "weekly": {
      const hour = formatTimeWithUnit(schedule_hour ?? 0, "hour-of-day");
      const day = formatDateTimeWithUnit(schedule_day ?? "mon", "day-of-week");
      scheduleString += t`${day} at ${hour}`;
      break;
    }
    case "monthly": {
      const hour = formatTimeWithUnit(schedule_hour ?? 0, "hour-of-day");
      const day = schedule_day
        ? formatDateTimeWithUnit(schedule_day, "day-of-week")
        : "calendar day";
      const frame = formatFrame(schedule_frame ?? "first");
      scheduleString += t`monthly on the ${frame} ${day} at ${hour}`;
      break;
    }
    default:
      scheduleString += schedule_type;
  }

  return scheduleString;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PulsesListSidebar;
