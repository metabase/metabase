import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  cronToScheduleSettings,
  scheduleSettingsToCron,
} from "metabase/admin/performance/utils";
import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useListUsersQuery,
} from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ModalContent from "metabase/components/ModalContent";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { getAlertTriggerOptions } from "metabase/lib/notifications";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { AlertModalSettingsBlock } from "metabase/notifications/modals/CreateOrUpdateAlertModal/AlertModalSettingsBlock";
import { AlertTriggerIcon } from "metabase/notifications/modals/CreateOrUpdateAlertModal/AlertTriggerIcon";
import type { NotificationTriggerOption } from "metabase/notifications/modals/CreateOrUpdateAlertModal/types";
import { NotificationChannelsPicker } from "metabase/notifications/modals/components/NotificationChannelsPicker";
import {
  DEFAULT_ALERT_SCHEDULE,
  getDefaultQuestionAlertRequest,
} from "metabase/notifications/utils";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Flex, Select, Stack, Switch } from "metabase/ui";
import type {
  CreateAlertNotificationRequest,
  NotificationCardSendCondition,
  NotificationHandler,
  ScheduleSettings,
  ScheduleType,
} from "metabase-types/api";

const ALERT_TRIGGER_OPTIONS_MAP: Record<
  NotificationCardSendCondition,
  NotificationTriggerOption
> = {
  has_result: {
    value: "has_result" as const,
    label: t`When this has results`,
  },
  goal_above: {
    value: "goal_above" as const,
    label: t`When results go above the goal line`,
  },
  goal_below: {
    value: "goal_below" as const,
    label: t`When results go below the goal line`,
  },
};

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
  const { data: users } = useListUsersQuery({});

  const [notification, setNotification] =
    useState<CreateAlertNotificationRequest | null>(null);

  const subscription = notification?.subscriptions[0];

  const [createNotification] = useCreateNotificationMutation();

  const questionId = question?.id();

  const triggerOptions = getAlertTriggerOptions({
    question,
    visualizationSettings,
  }).map(trigger => ALERT_TRIGGER_OPTIONS_MAP[trigger]);

  const hasSingleTriggerOption = triggerOptions.length === 1;

  // useEffect(() => {
  //   if (question && alert) {
  //     setAlert({
  //       ...alert,
  //       card: { ...alert.card, id: question.id() },
  //     });
  //   }
  // }, [question]);

  useEffect(() => {
    if (questionId && channelSpec && user && !notification) {
      setNotification(
        getDefaultQuestionAlertRequest({
          cardId: questionId,
          userId: user.id,
          channelSpec,
          availableTriggerOptions: triggerOptions,
        }),
      );
    }
  }, [notification, channelSpec, questionId, triggerOptions, user]);

  const onCreateAlert = async () => {
    if (notification) {
      await createNotification(notification);

      await dispatch(updateUrl(question, { dirty: false }));

      onAlertCreated();
    }
  };

  if (!notification || !subscription) {
    return null;
  }

  // TODO: add validity check for new data format
  // const isValid = alertIsValid(notification, channelSpec);

  return (
    <ModalContent
      data-testid="alert-create"
      title={t`New alert`}
      footer={
        <>
          <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{ default: t`Done` }}
            // disabled={!isValid}
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
              data={triggerOptions}
              value={notification.payload.send_condition}
              w={276}
              disabled={hasSingleTriggerOption}
              onChange={value =>
                setNotification({
                  ...notification,
                  payload: {
                    ...notification.payload,
                    send_condition: value as NotificationCardSendCondition,
                  },
                })
              }
            />
          </Flex>
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock title={t`When do you want to check this?`}>
          <SchedulePicker
            schedule={
              cronToScheduleSettings(subscription.cron_schedule) ||
              DEFAULT_ALERT_SCHEDULE // default is just for typechecking
            }
            scheduleOptions={ALERT_SCHEDULE_OPTIONS}
            style={{
              marginTop: 0, // TODO: refactor hacky styles?
            }}
            onScheduleChange={(nextSchedule: ScheduleSettings) => {
              if (nextSchedule.schedule_type) {
                setNotification({
                  ...notification,
                  subscriptions: [
                    {
                      ...subscription,
                      cron_schedule: scheduleSettingsToCron(nextSchedule),
                    },
                  ],
                });
              }
            }}
            textBeforeInterval={t`Check`}
          />
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock
          title={t`Where do you want to send the results?`}
        >
          <NotificationChannelsPicker
            notificationHandlers={notification.handlers}
            channels={channelSpec ? channelSpec.channels : undefined}
            users={users?.data || []}
            onChange={(newHandlers: NotificationHandler[]) => {
              setNotification({
                ...notification,
                handlers: newHandlers,
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
            checked={notification.payload.send_once}
            onChange={e =>
              setNotification({
                ...notification,
                payload: {
                  ...notification.payload,
                  send_once: e.target.checked,
                },
              })
            }
          />
        </AlertModalSettingsBlock>
      </Stack>
    </ModalContent>
  );
};
