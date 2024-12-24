import { useEffect, useState } from "react";
import { t } from "ttag";

import { useGetChannelInfoQuery } from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ModalContent from "metabase/components/ModalContent";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { NotificationChannelsPicker } from "metabase/notifications/NotificationChannelsPicker";
import { AlertModalSettingsBlock } from "metabase/notifications/modals/CreateOrUpdateAlertModal/AlertModalSettingsBlock";
import { AlertTriggerIcon } from "metabase/notifications/modals/CreateOrUpdateAlertModal/AlertTriggerIcon";
import { getScheduleFromChannel } from "metabase/notifications/modals/schedule";
import { createAlert } from "metabase/notifications/redux/alert";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Select, Stack, Switch } from "metabase/ui";
import { ALERT_TYPE_ROWS, getDefaultAlert } from "metabase-lib/v1/Alert";
import { ALERT_DEFAULT_SLACK_CHANNEL_CONFIG } from "metabase-lib/v1/Alert/Alert";
import type {
  Channel,
  CreateAlertRequest,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

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

  const { data: channelSpec } = useGetChannelInfoQuery();

  const [formState, setFormState] = useState({
    schedule: {
      schedule_type: ALERT_SCHEDULE_OPTIONS[0],
    } as ScheduleSettings,
    trigger: ALERT_TRIGGER_OPTIONS[0].value,
    sendOnce: false,
  });

  const alertType =
    (notificationType === "alert" &&
      question?.alertType(visualizationSettings)) ||
    ALERT_TYPE_ROWS;

  const [alert, setAlert] = useState(
    getDefaultAlert(question, alertType, user, channelSpec),
  );

  useEffect(() => {
    if (question) {
      setAlert(currentAlert => ({
        ...currentAlert,
        card: { ...currentAlert.card, id: question.id() },
      }));
    }
  }, [question]);

  useEffect(() => {
    if (channelSpec && channelSpec.channels.slack.configured) {
      setAlert(currentAlert => {
        const slackChannel = currentAlert.channels.find(
          ({ channel_type }) => channel_type === "slack",
        );

        if (slackChannel) {
          return currentAlert;
        }

        return {
          ...currentAlert,
          channels: [
            ...currentAlert.channels,
            ALERT_DEFAULT_SLACK_CHANNEL_CONFIG,
          ],
        };
      });
    }
  }, [channelSpec]);

  const onCreateAlert = async () => {
    await dispatch(createAlert(alert));
    await dispatch(updateUrl(question, { dirty: false }));

    onAlertCreated();
  };

  const isValid = alertIsValid(alert, channelSpec);

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
            <AlertTriggerIcon />
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
          title={t`Where do you want to send the results?`}
        >
          <NotificationChannelsPicker
            alert={alert}
            channels={channelSpec ? channelSpec.channels : undefined}
            users={[] /* TODO: add users list for emails picker*/}
            onAlertChange={(alert: CreateAlertRequest) => {
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
            getInvalidRecipientText={domains =>
              t`You're only allowed to email alerts to addresses ending in ${domains}`
            }
            isAdminUser={isAdmin}
          />
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock title={t`More options`}>
          <Switch
            label={t`Only send this alert once`}
            labelPosition="right"
            size="sm"
            checked={formState.sendOnce}
            onChange={e =>
              setFormState(prevState => ({
                ...prevState,
                sendOnce: e.target.checked,
              }))
            }
          />
        </AlertModalSettingsBlock>
      </Stack>
    </ModalContent>
  );
};
