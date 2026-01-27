import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useListChannelsQuery,
  useSendUnsavedNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import { ActionButton } from "metabase/common/components/ActionButton";
import CS from "metabase/css/core/index.css";
import { getResponseErrorMessage } from "metabase/lib/errors";
import {
  alertIsValid,
  getAlertTriggerOptions,
} from "metabase/lib/notifications";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailOrSlackChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getDefaultQuestionAlertRequest } from "metabase/notifications/utils";
import { updateUrl } from "metabase/query_builder/actions/url";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { addUndo } from "metabase/redux/undo";
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
  NotificationCronSubscription,
  NotificationHandler,
  ScheduleType,
  UpdateAlertNotificationRequest,
} from "metabase-types/api";

import { ChannelSetupModal } from "../ChannelSetupModal";
import { NotificationChannelsPicker } from "../components/NotificationChannelsPicker";

import { AlertTriggerIcon } from "./AlertTriggerIcon";
import { AlertModalSettingsBlock } from "./components/AlertModalSettingsBlock/AlertModalSettingsBlock";
import { NotificationSchedule } from "./components/NotificationSchedule/NotificationSchedule";
import type { NotificationTriggerOption } from "./types";

const ALERT_TRIGGER_OPTIONS_MAP: Record<
  NotificationCardSendCondition,
  NotificationTriggerOption
> = {
  has_result: {
    value: "has_result" as const,
    get label() {
      return t`When this question has results`;
    },
  },
  goal_above: {
    value: "goal_above" as const,
    get label() {
      return t`When results go above the goal`;
    },
  },
  goal_below: {
    value: "goal_below" as const,
    get label() {
      return t`When results go below the goal`;
    },
  },
};

const ALERT_SCHEDULE_OPTIONS: ScheduleType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
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
  const hasConfiguredEmailOrSlackChannel =
    getHasConfiguredEmailOrSlackChannel(channelSpec);

  const triggerOptions = useMemo(
    () =>
      getAlertTriggerOptions({
        question,
        visualizationSettings,
      }).map((trigger) => ALERT_TRIGGER_OPTIONS_MAP[trigger]),
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
        const errorText =
          getResponseErrorMessage(result.error) ?? t`An error occurred`;

        dispatch(
          addUndo({
            icon: "warning",
            toastColor: "error",
            message: t`Failed save alert. ${errorText}`,
          }),
        );

        // need to throw to show error in ActionButton
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
            message: t`Failed to send test alert. ${getResponseErrorMessage(result.error) ?? t`An error occurred`}`,
          }),
        );
      }
    }
  };

  const channelRequirementsMet = userCanAccessSettings
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailOrSlackChannel; // webhooks are available only for users with "Settings access" permission - WRK-63

  const handleScheduleChange = useCallback(
    (updatedSubscription: NotificationCronSubscription) => {
      if (!subscription) {
        return;
      }

      setNotification({
        ...notification,
        subscriptions: [updatedSubscription],
      });
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
                onChange={(value) =>
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
        <AlertModalSettingsBlock
          title={t`When do you want to check this?`}
          style={{
            "--alert-modal-content-padding": "0",
          }}
        >
          <NotificationSchedule
            subscription={subscription}
            scheduleOptions={ALERT_SCHEDULE_OPTIONS}
            onScheduleChange={handleScheduleChange}
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
            getInvalidRecipientText={(domains) =>
              userCanAccessSettings
                ? t`You're only allowed to email alerts to addresses ending in ${domains}`
                : t`You're only allowed to email alerts to allowed domains`
            }
          />
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock title={t`More options`}>
          <Switch
            label={t`Delete this Alert after it's triggered`}
            styles={{
              label: {
                lineHeight: "1.5rem",
              },
            }}
            labelPosition="right"
            size="sm"
            checked={notification.payload.send_once}
            onChange={(e) =>
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
          <ActionButton
            primary
            disabled={!isValid}
            actionFn={onCreateOrEditAlert}
          >
            {isEditMode && hasChanges ? t`Save changes` : t`Done`}
          </ActionButton>
        </div>
      </Flex>
    </Modal>
  );
};
