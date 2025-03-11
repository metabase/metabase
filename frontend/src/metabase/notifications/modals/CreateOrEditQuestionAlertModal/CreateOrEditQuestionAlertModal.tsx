import { useCallback, useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import { isEqual } from "underscore";

import {
  cronToScheduleSettings,
  scheduleSettingsToCron,
} from "metabase/admin/performance/utils";
import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useListChannelsQuery,
  useSendUnsavedNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import { Schedule } from "metabase/components/Schedule/Schedule";
import CS from "metabase/css/core/index.css";
import {
  alertIsValid,
  getAlertTriggerOptions,
} from "metabase/lib/notifications";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  DEFAULT_ALERT_SCHEDULE,
  getDefaultQuestionAlertRequest,
} from "metabase/notifications/utils";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { addUndo } from "metabase/redux/undo";
import { getSetting } from "metabase/selectors/settings";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import {
  Button,
  Flex,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  rem,
} from "metabase/ui";
import type {
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardSendCondition,
  NotificationHandler,
  ScheduleSettings,
  ScheduleType,
  UpdateAlertNotificationRequest,
} from "metabase-types/api";

import { ChannelSetupModal } from "../ChannelSetupModal";
import { NotificationChannelsPicker } from "../components/NotificationChannelsPicker";

import { AlertModalSettingsBlock } from "./AlertModalSettingsBlock";
import { AlertTriggerIcon } from "./AlertTriggerIcon";
import type { NotificationTriggerOption } from "./types";

const ALERT_TRIGGER_OPTIONS_MAP: Record<
  NotificationCardSendCondition,
  NotificationTriggerOption
> = {
  has_result: {
    value: "has_result" as const,
    label: t`When this question has results`,
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
  "monthly",
];

type CreateOrEditQuestionAlertModalProps = {
  onClose: () => void;
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
  onAlertCreated,
  onAlertUpdated,
  onClose,
}: CreateOrEditQuestionAlertModalProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const visualizationSettings = useSelector(getVisualizationSettings);
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);
  const timezone = useSelector(state =>
    getSetting(state, "report-timezone-short"),
  );

  const [notification, setNotification] = useState<
    CreateAlertNotificationRequest | UpdateAlertNotificationRequest | null
  >(null);

  const questionId = question?.id();
  const isEditMode = !!editingNotification;
  const subscription = notification?.subscriptions[0];

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();
  const { data: hookChannels } = useListChannelsQuery();

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();
  const [sendUnsavedNotification, { isLoading }] =
    useSendUnsavedNotificationMutation();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  const triggerOptions = useMemo(
    () =>
      getAlertTriggerOptions({
        question,
        visualizationSettings,
      }).map(trigger => ALERT_TRIGGER_OPTIONS_MAP[trigger]),
    [question, visualizationSettings],
  );

  const hasSingleTriggerOption = triggerOptions.length === 1;

  useEffect(() => {
    if (questionId && channelSpec && user && hookChannels && !notification) {
      setNotification(
        isEditMode
          ? { ...editingNotification }
          : getDefaultQuestionAlertRequest({
              cardId: questionId,
              currentUserId: user.id,
              channelSpec,
              hookChannels,
              availableTriggerOptions: triggerOptions,
              userCanAccessSettings,
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
    hookChannels,
    userCanAccessSettings,
  ]);

  const onCreateOrEditAlert = async () => {
    if (notification) {
      let result;

      if (isEditMode) {
        result = await updateNotification(
          notification as UpdateAlertNotificationRequest, // TODO: remove typecast
        );
      } else {
        result = await createNotification(notification);
      }

      if (result.error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`An error occurred`,
          }),
        );

        // need to throw to show error in ButtonWithStatus
        throw result.error;
      }

      dispatch(
        addUndo({
          message: isEditMode
            ? t`Your alert was updated.`
            : t`Your alert is all set up.`,
        }),
      );

      if (isEditMode) {
        onAlertUpdated();
      } else {
        onAlertCreated();
      }

      await dispatch(updateUrl(question, { dirty: false }));
    }
  };

  const onSendNow = async () => {
    if (notification) {
      const result = await sendUnsavedNotification(notification);

      if (result.error) {
        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`An error occurred`,
          }),
        );
      }
    }
  };

  const channelRequirementsMet = userCanAccessSettings
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailChannel;

  const scheduleSettings = useMemo(() => {
    return (
      cronToScheduleSettings(subscription?.cron_schedule) ||
      DEFAULT_ALERT_SCHEDULE
    );
  }, [subscription]);

  const onScheduleChange = useCallback(
    (nextSchedule: ScheduleSettings) => {
      if (!subscription) {
        return;
      }

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
    },
    [setNotification, subscription, notification],
  );

  if (!isLoadingChannelInfo && channelSpec && !channelRequirementsMet) {
    return (
      <ChannelSetupModal
        userCanAccessSettings={userCanAccessSettings}
        onClose={onClose}
      />
    );
  }

  if (!notification || !subscription) {
    return null;
  }

  const isValid = alertIsValid(notification, channelSpec);
  const hasChanges = !isEqual(editingNotification, notification);

  return (
    <Modal
      data-testid="alert-create"
      opened
      size={rem(680)}
      onClose={onClose}
      padding="2.5rem"
      title={isEditMode ? t`Edit alert` : t`New alert`}
      styles={{
        body: {
          paddingLeft: 0,
          paddingRight: 0,
        },
      }}
    >
      <Stack gap="xl" mt="1.5rem" mb="2rem" px="2.5rem">
        <AlertModalSettingsBlock
          title={t`What do you want to be alerted about?`}
        >
          <Flex gap="lg" align="center">
            <AlertTriggerIcon />
            {hasSingleTriggerOption ? (
              <Paper
                data-testid="alert-goal-select"
                withBorder
                shadow="none"
                py="sm"
                px="1.5rem"
                bg="transparent"
              >
                <Text>{triggerOptions[0].label}</Text>
              </Paper>
            ) : (
              <Select
                data-testid="alert-goal-select"
                data={triggerOptions}
                value={notification.payload.send_condition}
                w={276}
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
            )}
          </Flex>
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock title={t`When do you want to check this?`}>
          <Schedule
            schedule={scheduleSettings}
            scheduleOptions={ALERT_SCHEDULE_OPTIONS}
            minutesOnHourPicker
            onScheduleChange={onScheduleChange}
            verb={c("A verb in the imperative mood").t`Check`}
            timezone={timezone}
            aria-label={t`Describe how often the alert notification should be sent`}
          />
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock
          title={t`Where do you want to send the results?`}
        >
          <NotificationChannelsPicker
            notificationHandlers={notification.handlers}
            channels={channelSpec ? channelSpec.channels : undefined}
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
      <Flex
        justify="space-between"
        px="2.5rem"
        pt="lg"
        className={CS.borderTop}
      >
        <Button
          variant="outline"
          color="brand"
          loading={isLoading}
          onClick={onSendNow}
        >
          {isLoading ? t`Sending…` : t`Send now`}
        </Button>
        <div>
          <Button onClick={onClose} className={CS.mr2}>{t`Cancel`}</Button>
          <ButtonWithStatus
            titleForState={{
              default: isEditMode && hasChanges ? t`Save changes` : t`Done`,
            }}
            disabled={!isValid}
            onClickOperation={onCreateOrEditAlert}
          />
        </div>
      </Flex>
    </Modal>
  );
};
