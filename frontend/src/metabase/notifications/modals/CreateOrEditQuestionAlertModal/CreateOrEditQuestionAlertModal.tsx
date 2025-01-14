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
  useUpdateNotificationMutation,
} from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { getAlertTriggerOptions } from "metabase/lib/notifications";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { AlertModalSettingsBlock } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/AlertModalSettingsBlock";
import { AlertTriggerIcon } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/AlertTriggerIcon";
import type { NotificationTriggerOption } from "metabase/notifications/modals/CreateOrEditQuestionAlertModal/types";
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
import { getUser } from "metabase/selectors/user";
import { Flex, Modal, Select, Stack, Switch, rem } from "metabase/ui";
import type {
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardSendCondition,
  NotificationHandler,
  ScheduleSettings,
  ScheduleType,
  UpdateAlertNotificationRequest,
} from "metabase-types/api";

import S from "./CreateOrEditQuestionAlertModal.module.css";

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

type CreateOrEditQuestionAlertModalProps = {
  onClose: () => void;
  opened: boolean;
} & (
  | {
      editingNotification?: undefined;
      onAlertCreated: () => void;
      onAlertUpdated?: () => void;
    }
  | {
      editingNotification: Notification;
      onAlertUpdated: () => void;
      onAlertCreated?: () => void;
    }
);

export const CreateOrEditQuestionAlertModal = ({
  editingNotification,
  opened,
  onAlertCreated,
  onAlertUpdated,
  onClose,
}: CreateOrEditQuestionAlertModalProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const visualizationSettings = useSelector(getVisualizationSettings);
  const user = useSelector(getUser);

  const { data: channelSpec } = useGetChannelInfoQuery();
  const { data: users } = useListUsersQuery({});

  const isEditMode = !!editingNotification;

  const [notification, setNotification] = useState<
    CreateAlertNotificationRequest | UpdateAlertNotificationRequest | null
  >(null);

  const subscription = notification?.subscriptions[0];

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();

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
        isEditMode
          ? { ...editingNotification }
          : getDefaultQuestionAlertRequest({
              cardId: questionId,
              userId: user.id,
              channelSpec,
              availableTriggerOptions: triggerOptions,
            }),
      );
    }
  }, [
    notification,
    channelSpec,
    questionId,
    triggerOptions,
    user,
    editingNotification,
    isEditMode,
  ]);

  const onCreateOrEditAlert = async () => {
    if (notification) {
      if (isEditMode) {
        await updateNotification(
          notification as UpdateAlertNotificationRequest, // TODO: remove typecast
        );
        onAlertUpdated();
      } else {
        await createNotification(notification);
        onAlertCreated();
      }

      await dispatch(updateUrl(question, { dirty: false }));
    }
  };

  if (!notification || !subscription) {
    return null;
  }

  // TODO: add validity check for new data format
  // const isValid = alertIsValid(notification, channelSpec);

  return (
    <Modal.Root
      data-testid="alert-create"
      opened={opened}
      size={rem(680)}
      onClose={onClose}
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" pb="2rem">
          <Modal.Title>{isEditMode ? t`Edit alert` : t`New alert`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2.5rem">
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
                className={S.noMarginTop}
                schedule={
                  cronToScheduleSettings(subscription.cron_schedule) ||
                  DEFAULT_ALERT_SCHEDULE // default is just for typechecking
                }
                scheduleOptions={ALERT_SCHEDULE_OPTIONS}
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
        </Modal.Body>
        <Flex
          justify="flex-end"
          px="2.5rem"
          py="1.5rem"
          className={CS.borderTop}
        >
          <Button onClick={onClose} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{ default: t`Done` }}
            // disabled={!isValid}
            onClickOperation={onCreateOrEditAlert}
          />
        </Flex>
      </Modal.Content>
    </Modal.Root>
  );
};
