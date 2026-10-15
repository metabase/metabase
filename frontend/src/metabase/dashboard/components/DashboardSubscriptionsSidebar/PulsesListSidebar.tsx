import cx from "classnames";
import { t } from "ttag";

import { Sidebar } from "metabase/common/components/Sidebar";
import { Label } from "metabase/common/components/type/Label";
import { Subhead } from "metabase/common/components/type/Subhead";
import CS from "metabase/css/core/index.css";
import { getEditableSubscriptionChannel } from "metabase/notifications/pulse/subscription-editing";
import {
  buildFilterText,
  buildRecipientText,
  formatSubscriptionDelivery,
} from "metabase/notifications/pulse/subscription-formatting";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import {
  ActionIcon,
  Card,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type {
  ChannelApiResponse,
  ChannelType,
  DashboardSubscription,
  IconName,
} from "metabase-types/api";

import { getParameters } from "../../selectors";

import S from "./PulsesListSidebar.module.css";

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

        <Flex align="center">
          <Tooltip label={createSubscriptionLabel}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={createSubscriptionLabel}
              mr="1rem"
              onClick={createSubscription}
            >
              <Icon name="add" />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={closeSidebarLabel}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={closeSidebarLabel}
              onClick={onCancel}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        </Flex>
      </div>
      <div className={cx(CS.my2, CS.mx4)}>
        {pulses.map((pulse) => {
          const editableChannel = getEditableSubscriptionChannel(
            pulse,
            formInput,
          );
          const canEdit = editableChannel != null;

          return (
            <Card
              aria-label="Pulse Card"
              key={pulse.id}
              className={cx(S.pulseCard, { [S.pulseCardEditable]: canEdit })}
              p={0}
              radius="sm"
              shadow="none"
              withBorder
              onClick={() =>
                editableChannel != null &&
                editPulse(pulse, editableChannel.channel_type)
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
                    CS.mb1,
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
                    size={12}
                  />
                  <Label className={cx(CS.hoverChild, CS.hoverInherit)} mb="0">
                    {formatSubscriptionDelivery(pulse.channels[0])}
                  </Label>
                </div>
                <PulseDetails pulse={pulse} parameters={parameters} />
              </div>
            </Card>
          );
        })}
      </div>
    </Sidebar>
  );
}

function getEmailSubject({
  channels: [firstChannel],
}: DashboardSubscription): string {
  return firstChannel.channel_type === "email"
    ? (firstChannel.details?.subject ?? "")
    : "";
}

type PulseDetailsProps = {
  pulse: DashboardSubscription;
  parameters: UiParameter[];
};

function PulseDetails({ pulse, parameters }: PulseDetailsProps) {
  const items: PulseDetailsItemProps[] = [
    { icon: "string", text: getEmailSubject(pulse) },
    { icon: "group", text: buildRecipientText(pulse) },
    { icon: "filter", text: buildFilterText(pulse, parameters) },
  ];

  return (
    <Stack
      component="ul"
      gap="sm"
      mah={130}
      className={cx(CS.scrollX, CS.scrollY)}
    >
      {items
        .filter(({ text }) => text !== "")
        .map(({ icon, text }) => (
          <PulseDetailsItem key={icon} icon={icon} text={text} />
        ))}
    </Stack>
  );
}

type PulseDetailsItemProps = {
  icon: IconName;
  text: string;
};

function PulseDetailsItem({ icon, text }: PulseDetailsItemProps) {
  return (
    <Group component="li" gap="sm" align="flex-start" wrap="nowrap" mr="sm">
      <Icon
        name={icon}
        size={12}
        c="text-secondary"
        className={CS.hoverChild}
      />
      <Text
        component="span"
        size="sm"
        fw="bold"
        c="text-secondary"
        className={CS.hoverChild}
      >
        {text}
      </Text>
    </Group>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PulsesListSidebar;
