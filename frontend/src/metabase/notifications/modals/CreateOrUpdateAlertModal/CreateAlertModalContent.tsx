import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ModalContent from "metabase/components/ModalContent";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { NotificationChannelsPicker } from "metabase/notifications/NotificationChannelsPicker";
import { AlertModalSettingsBlock } from "metabase/notifications/modals/CreateOrUpdateAlertModal/AlertModalSettingsBlock";
import { getScheduleFromChannel } from "metabase/notifications/modals/schedule";
import { getPulseFormInput } from "metabase/notifications/pulse/selectors";
import { createAlert } from "metabase/notifications/redux/alert";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Icon, Select, Stack } from "metabase/ui";
import { ALERT_TYPE_ROWS, getDefaultAlert } from "metabase-lib/v1/Alert";
import type {
  Alert,
  Channel,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

import ChannelSetupModal from "./ChannelSetupModal";

const ALERT_TRIGGER_OPTIONS = [
  {
    value: "has_results",
    label: t`When this has results`,
  },
  {
    value: "goal_above",
    label: t`When results go above the goal line`,
  },
  {
    value: "goal_below",
    label: t`When results go below the goal line`,
  },
];

const ALERT_SCHEDULE_OPTIONS: ScheduleType[] = [
  "hourly",
  "daily",
  "weekly",
] as const;

interface CreateAlertModalContentProps {
  notificationType: "alert" | "subscription";
  onAlertCreated: () => void;
  onCancel: () => void;
}

export const CreateAlertModalContent = ({
  notificationType,
  onAlertCreated,
  onCancel,
}: CreateAlertModalContentProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const visualizationSettings = useSelector(getVisualizationSettings);
  const isAdmin = useSelector(getUserIsAdmin);
  const user = useSelector(getUser);
  const channelsConfig = useSelector(getPulseFormInput);

  const { data: channelSpec = {}, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();

  const [formState, setFormState] = useState({
    schedule: {
      schedule_type: ALERT_SCHEDULE_OPTIONS[0],
    } as ScheduleSettings,
    trigger: ALERT_TRIGGER_OPTIONS[0].value,
  });

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  const alertType =
    (notificationType === "alert" &&
      question?.alertType(visualizationSettings)) ||
    ALERT_TYPE_ROWS;

  const [alert, setAlert] = useState<any>(
    getDefaultAlert(question, alertType, user),
  );

  useEffect(() => {
    // NOTE Atte Keinänen 11/6/17: Don't fill in the card information yet
    // Because `onCreate` and `onSave` of QueryHeader mix Redux action dispatches and `setState` calls,
    // we don't have up-to-date card information in the constructor yet
    // TODO: Refactor QueryHeader so that `onCreate` and `onSave` only call Redux actions and don't modify the local state
    setAlert((currentAlert: any) => ({
      ...currentAlert,
      card: { ...currentAlert.card, id: question?.id() },
    }));
  }, [question]);

  const onCreateAlert = async () => {
    await dispatch(createAlert(alert));
    await dispatch(updateUrl(question, { dirty: false }));

    onAlertCreated();
  };

  const channelRequirementsMet = isAdmin
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailChannel;

  const isValid = alertIsValid(alert, channelSpec);

  if (!isLoadingChannelInfo && !channelRequirementsMet) {
    return (
      <ChannelSetupModal
        user={user}
        onClose={onCancel}
        entityNamePlural={t`alerts`}
        channels={isAdmin ? ["email", "Slack", "Webhook"] : ["email"]}
      />
    );
  }

  return (
    <ModalContent
      data-testid="alert-create"
      title={t`New alert`}
      footer={
        <>
          <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{ default: t`Done` }}
            disabled={!isValid}
            onClickOperation={onCreateAlert}
          />
        </>
      }
      onClose={onCancel}
    >
      <Stack spacing="2.5rem">
        <AlertModalSettingsBlock
          title={t`What do you want to be alerted about?`}
        >
          <Flex gap="1.5rem">
            <Icon name="alert" />
            <Select
              data={ALERT_TRIGGER_OPTIONS}
              value={formState.trigger}
              w={276}
              onChange={value =>
                setFormState(prevState => ({
                  ...prevState,
                  trigger: value as string,
                }))
              }
            />
          </Flex>
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock title={t`When do you want to check this?`}>
          <SchedulePicker
            schedule={formState.schedule}
            scheduleOptions={ALERT_SCHEDULE_OPTIONS}
            style={{
              marginTop: 0,
            }}
            onScheduleChange={(nextSchedule: ScheduleSettings) => {
              if (nextSchedule.schedule_type) {
                setFormState(prevState => ({
                  ...prevState,
                  schedule: nextSchedule,
                }));
              }
            }}
            textBeforeInterval={t`Check`}
          />
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock
          title={t`Where do you want to send the results? `}
        >
          <NotificationChannelsPicker
            alert={alert}
            channels={channelsConfig?.channels}
            users={[]}
            setPulse={(alert: Alert) => {
              // If the pulse channel has been added, it PulseEditChannels puts the default schedule to it
              // We want to have same schedule for all channels
              const schedule = getScheduleFromChannel(
                alert.channels.find(c => c.channel_type === "email") as Channel, // TODO: remove typecast
              );

              setAlert({
                ...alert,
                channels: alert.channels.map(channel => ({
                  ...channel,
                  ...schedule,
                })),
              });
            }}
            emailRecipientText={t`Email alerts to:`}
            invalidRecipientText={domains =>
              t`You're only allowed to email alerts to addresses ending in ${domains}`
            }
            isAdminUser={isAdmin}
          />
        </AlertModalSettingsBlock>
      </Stack>
      {/*<AlertEditForm*/}
      {/*  type={notificationType}*/}
      {/*  alertType={alertType}*/}
      {/*  alert={alert}*/}
      {/*  onAlertChange={onAlertChange}*/}
      {/*/>*/}
    </ModalContent>
  );
};
