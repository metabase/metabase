import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useListChannelsQuery,
  useSendUnsavedNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import {
  alertIsValid,
  getAlertTriggerOptions,
  getDefaultQuestionAlertRequest,
} from "metabase/notifications/utils";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailOrSlackChannel,
} from "metabase/pulse";
import { updateUrl } from "metabase/query_builder/actions/url";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import {
  Badge,
  Button,
  Flex,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  rem,
} from "metabase/ui";
import { getResponseErrorMessage } from "metabase/utils/errors";
import type Question from "metabase-lib/v1/Question";
import type {
  CreateAlertNotificationRequest,
  Notification,
  NotificationCardRowDiffSendMode,
  NotificationCardSendCondition,
  NotificationCronSubscription,
  NotificationHandler,
  ScheduleType,
  UpdateAlertNotificationRequest,
} from "metabase-types/api";
import type { Field } from "metabase-types/api/field";

import { ChannelSetupModal } from "../ChannelSetupModal";
import { NotificationChannelsPicker } from "../components/NotificationChannelsPicker";

import { AlertTriggerIcon } from "./AlertTriggerIcon";
import { AlertModalSettingsBlock } from "./components/AlertModalSettingsBlock/AlertModalSettingsBlock";
import { NotificationSchedule } from "./components/NotificationSchedule/NotificationSchedule";
import type {
  NotificationTriggerOption,
  NotificationTriggerValue,
} from "./types";

function getAlertTriggerOptionsMap(
  question: Question | undefined,
): Record<
  NotificationCardSendCondition | "watch_new_rows",
  NotificationTriggerOption
> {
  const isMetric = question?.type() === "metric";
  return {
    has_result: {
      value: "has_result" as const,
      label: isMetric
        ? t`When this metric has results`
        : t`When this question has results`,
    },
    goal_above: {
      value: "goal_above" as const,
      label: t`When results go above the goal`,
    },
    goal_below: {
      value: "goal_below" as const,
      label: t`When results go below the goal`,
    },
    watch_new_rows: {
      value: "watch_new_rows" as const,
      label: t`When new rows appear`,
    },
  };
}

const ALERT_SCHEDULE_OPTIONS: ScheduleType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
];

type CreateOrEditQuestionAlertModalWithQuestionProps = {
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

type CreateOrEditQuestionAlertModalProps =
  CreateOrEditQuestionAlertModalWithQuestionProps & {
    question?: Question;
  };

export const CreateOrEditQuestionAlertModalWithQuestion = ({
  editingNotification,
  onAlertCreated,
  onAlertUpdated,
  onClose,
}: CreateOrEditQuestionAlertModalWithQuestionProps) => {
  const question = useSelector(getQuestion);

  if (editingNotification) {
    return (
      <CreateOrEditQuestionAlertModal
        question={question}
        editingNotification={editingNotification}
        onAlertUpdated={onAlertUpdated}
        onClose={onClose}
      />
    );
  } else {
    return (
      <CreateOrEditQuestionAlertModal
        question={question}
        onAlertCreated={onAlertCreated}
        onClose={onClose}
      />
    );
  }
};

export const CreateOrEditQuestionAlertModal = ({
  editingNotification,
  onAlertCreated,
  onAlertUpdated,
  onClose,
  question,
}: CreateOrEditQuestionAlertModalProps) => {
  const dispatch = useDispatch();
  const visualizationSettings = useSelector(getVisualizationSettings);
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const [notification, setNotification] = useState<
    CreateAlertNotificationRequest | UpdateAlertNotificationRequest | null
  >(null);

  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);

  const questionId = question?.id();
  const resultColumns: Field[] = question?.card()?.result_metadata ?? [];
  const isEditMode = !!editingNotification;
  const subscription = notification?.subscriptions[0];

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();
  const { data: hookChannels } = useListChannelsQuery();

  const [createNotification, { isLoading: isCreating, error: errorCreating }] =
    useCreateNotificationMutation();
  const [updateNotification, { isLoading: isUpdating, error: errorUpdating }] =
    useUpdateNotificationMutation();
  const [sendUnsavedNotification, { isLoading }] =
    useSendUnsavedNotificationMutation();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailOrSlackChannel =
    getHasConfiguredEmailOrSlackChannel(channelSpec);

  const triggerOptions = useMemo(() => {
    const optionsMap = getAlertTriggerOptionsMap(question);
    const conditionOptions = getAlertTriggerOptions({
      question,
      visualizationSettings,
    }).map((trigger) => optionsMap[trigger]);
    return [...conditionOptions, optionsMap["watch_new_rows"]];
  }, [question, visualizationSettings]);

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

        return;
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

  const currentTriggerValue: NotificationTriggerValue =
    notification.payload_type === "notification/card-row-diff"
      ? "watch_new_rows"
      : notification.payload.send_condition;

  const isValid = alertIsValid(notification, channelSpec);
  const hasChanges = !isEqual(editingNotification, notification);
  const hasError = errorCreating || errorUpdating;

  const submitButtonLabel = match({
    hasError,
    isEditMode,
    hasChanges,
  })
    .with({ hasError: P.nonNullable }, () => t`Save failed`)
    .with({ isEditMode: true, hasChanges: true }, () => t`Save changes`)
    .otherwise(() => t`Done`);

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
          paddingBottom: "1.5rem",
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
                value={currentTriggerValue}
                w={276}
                onChange={(value: string | null) => {
                  if (!value) {
                    return;
                  }
                  if (value === "watch_new_rows") {
                    setNotification({
                      ...notification,
                      payload_type: "notification/card-row-diff",
                      payload: {
                        card_id: notification.payload.card_id,
                        send_mode: "per-row",
                      },
                    });
                  } else {
                    setNotification({
                      ...notification,
                      payload_type: "notification/card",
                      payload: {
                        card_id: notification.payload.card_id,
                        send_condition: value as NotificationCardSendCondition,
                        send_once: false,
                      },
                    });
                  }
                }}
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
        {!isEmbeddingSdk() && (
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
        )}

        <AlertModalSettingsBlock title={t`More options`}>
          {notification.payload_type === "notification/card-row-diff" ? (
            <Select
              label={t`Delivery format`}
              data={[
                { value: "per-row", label: t`One message per new row` },
                { value: "digest", label: t`One message for all new rows` },
              ]}
              value={notification.payload.send_mode}
              onChange={(value: string | null) => {
                if (
                  !value ||
                  notification.payload_type !== "notification/card-row-diff"
                ) {
                  return;
                }
                setNotification({
                  ...notification,
                  payload: {
                    ...notification.payload,
                    send_mode: value as NotificationCardRowDiffSendMode,
                  },
                });
              }}
            />
          ) : (
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
          )}
        </AlertModalSettingsBlock>

        {notification.payload_type === "notification/card-row-diff" && (
          <AlertModalSettingsBlock title={t`Message template (optional)`}>
            <Stack gap="xs">
              <Textarea
                ref={templateTextareaRef}
                placeholder={t`e.g. "Yesterday we sold {{count}} of {{product}}"`}
                autosize
                minRows={2}
                value={notification.payload.message_template ?? ""}
                onChange={(e) =>
                  setNotification({
                    ...notification,
                    payload: {
                      ...notification.payload,
                      message_template: e.target.value || null,
                    },
                  })
                }
              />
              {resultColumns.length > 0 && (
                <Group gap="xs">
                  <Text size="xs" c="text-secondary">{t`Insert column:`}</Text>
                  {resultColumns.map((col) => (
                    <Badge
                      key={col.name}
                      variant="outline"
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        const el = templateTextareaRef.current;
                        const placeholder = `{{${col.name}}}`;
                        if (!el) {
                          setNotification({
                            ...notification,
                            payload: {
                              ...notification.payload,
                              message_template:
                                (notification.payload.message_template ?? "") +
                                placeholder,
                            },
                          });
                          return;
                        }
                        const start = el.selectionStart ?? el.value.length;
                        const end = el.selectionEnd ?? el.value.length;
                        const current = el.value;
                        const next =
                          current.slice(0, start) +
                          placeholder +
                          current.slice(end);
                        setNotification({
                          ...notification,
                          payload: {
                            ...notification.payload,
                            message_template: next || null,
                          },
                        });
                        requestAnimationFrame(() => {
                          el.focus();
                          el.setSelectionRange(
                            start + placeholder.length,
                            start + placeholder.length,
                          );
                        });
                      }}
                    >
                      {col.display_name}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>
          </AlertModalSettingsBlock>
        )}
      </Stack>
      <Flex
        justify="space-between"
        align="center"
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
        <Flex align="center" gap="sm">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            bg={hasError ? "error" : "brand"}
            disabled={!isValid || isCreating || isUpdating}
            loading={isCreating || isUpdating}
            onClick={onCreateOrEditAlert}
          >
            {submitButtonLabel}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};
