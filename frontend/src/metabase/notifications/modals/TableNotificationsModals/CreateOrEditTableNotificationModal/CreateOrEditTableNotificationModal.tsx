import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useGetNotificationPayloadExampleMutation,
  useListChannelsQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import { AutoWidthSelect } from "metabase/components/Schedule/AutoWidthSelect";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/notifications";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { ChannelSetupModal } from "metabase/notifications/modals/shared/ChannelSetupModal";
import { AlertModalSettingsBlock } from "metabase/notifications/modals/shared/components/AlertModalSettingsBlock/AlertModalSettingsBlock";
import { AlertTriggerIcon } from "metabase/notifications/modals/shared/components/AlertTriggerIcon";
import { NotificationChannelsPicker } from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsPicker/NotificationChannelsPicker";
import { getDefaultTableNotificationRequest } from "metabase/notifications/utils";
import { addUndo } from "metabase/redux/undo";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import { Button, Flex, Modal, Stack } from "metabase/ui";
import type {
  ActionType,
  CreateTableNotificationRequest,
  NotificationHandler,
  SystemEvent,
  TableId,
  TableNotification,
  UpdateTableNotificationRequest,
} from "metabase-types/api";

type TableNotificationTriggerOption = {
  value: {
    eventName: SystemEvent;
    action: ActionType;
  };
  label: string;
  action: ActionType;
};

// Format JSON for tooltip display
const formatJsonForTooltip = (json: any) => {
  return json ? JSON.stringify(json, null, 2) : "";
};

const NOTIFICATION_TRIGGER_OPTIONS_MAP: Record<
  ActionType,
  TableNotificationTriggerOption
> = {
  "row/create": {
    value: {
      eventName: "event/action.success",
      action: "row/create",
    },
    label: t`When new records are created`,
    action: "row/create",
  },
  "row/update": {
    value: {
      eventName: "event/action.success",
      action: "row/update",
    },
    label: t`When any cell changes it's value`,
    action: "row/update",
  },
  "row/delete": {
    value: {
      eventName: "event/action.success",
      action: "row/delete",
    },
    label: t`When a record is deleted`,
    action: "row/delete",
  },
};

type CreateOrEditTableNotificationModalProps = {
  tableId: TableId;
  onClose: () => void;
} & (
  | {
      notification: null;
      onNotificationCreated: () => void;
      onNotificationUpdated?: () => void;
    }
  | {
      notification: TableNotification;
      onNotificationUpdated: () => void;
      onNotificationCreated?: () => void;
    }
);

export const CreateOrEditTableNotificationModal = ({
  tableId,
  notification,
  onNotificationCreated,
  onNotificationUpdated,
  onClose,
}: CreateOrEditTableNotificationModalProps) => {
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);

  const [requestBody, setRequestBody] = useState<
    CreateTableNotificationRequest | UpdateTableNotificationRequest | null
  >(null);

  // State to store the template JSON for the current event_name
  const [templateJson, setTemplateJson] = useState<string>("");

  const isEditMode = !!notification;

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();
  const { data: hookChannels } = useListChannelsQuery();

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();
  const [getNotificationPayloadExample] =
    useGetNotificationPayloadExampleMutation();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  const triggerOptions = useMemo(
    () =>
      (["row/create", "row/update", "row/delete"] as ActionType[]).map(
        (action) => ({
          value: action,
          label: NOTIFICATION_TRIGGER_OPTIONS_MAP[action].label,
          option: NOTIFICATION_TRIGGER_OPTIONS_MAP[action],
        }),
      ),
    [],
  );

  useEffect(() => {
    if (tableId && channelSpec && user && hookChannels && !requestBody) {
      const defaultOption = NOTIFICATION_TRIGGER_OPTIONS_MAP["row/create"];
      setRequestBody(
        isEditMode
          ? { ...notification }
          : getDefaultTableNotificationRequest({
              tableId,
              eventName: defaultOption.value.eventName,
              action: defaultOption.value.action,
              currentUserId: user.id,
              channelSpec,
              hookChannels,
              userCanAccessSettings,
            }),
      );
    }
  }, [
    requestBody,
    channelSpec,
    triggerOptions,
    user,
    isEditMode,
    hookChannels,
    userCanAccessSettings,
    tableId,
    notification,
  ]);

  // Get example payload when action changes
  useEffect(() => {
    const fetchExamplePayload = async () => {
      if (
        !requestBody?.payload?.event_name ||
        !requestBody?.payload?.action ||
        !user
      ) {
        return;
      }

      const result = await getNotificationPayloadExample({
        payload_type: "notification/system-event",
        payload: {
          event_name: requestBody.payload.event_name as "event/action.success",
          action: requestBody.payload.action as ActionType,
        },
        creator_id: user.id,
      });

      if (result.data) {
        setTemplateJson(formatJsonForTooltip(result.data.payload));
      }
    };

    fetchExamplePayload();
  }, [
    getNotificationPayloadExample,
    requestBody?.payload?.action,
    requestBody?.payload?.event_name,
    user,
  ]);

  const onCreateOrEditAlert = async () => {
    if (requestBody) {
      let result;

      if (isEditMode) {
        result = await updateNotification(
          requestBody as UpdateTableNotificationRequest,
        );
      } else {
        result = await createNotification(requestBody);
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
        onNotificationUpdated();
      } else {
        onNotificationCreated();
      }
    }
  };

  const channelRequirementsMet = userCanAccessSettings
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailChannel;

  if (!isLoadingChannelInfo && channelSpec && !channelRequirementsMet) {
    return (
      <ChannelSetupModal
        userCanAccessSettings={userCanAccessSettings}
        onClose={onClose}
      />
    );
  }

  if (!requestBody || !requestBody.payload) {
    return null;
  }

  const isValid = alertIsValid(requestBody.handlers, channelSpec);
  const hasChanges = !isEqual(requestBody, notification);

  return (
    <Modal
      data-testid="table-notification-create"
      opened
      size="lg"
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
          title={t`What do you want to be notified about?`}
        >
          <Flex gap="lg" align="center">
            <AlertTriggerIcon />
            <AutoWidthSelect
              data-testid="notification-event-select"
              data={triggerOptions}
              value={requestBody.payload.action}
              onChange={(value) => {
                if (value) {
                  const selectedOption =
                    NOTIFICATION_TRIGGER_OPTIONS_MAP[value as ActionType];
                  if (selectedOption) {
                    setRequestBody({
                      ...requestBody,
                      payload: {
                        ...requestBody.payload,
                        event_name: selectedOption.value.eventName,
                        action: selectedOption.value.action,
                      },
                    });
                  }
                }
              }}
            />
          </Flex>
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock
          title={t`Where do you want to send the alerts?`}
        >
          <NotificationChannelsPicker
            enableTemplates
            notificationHandlers={requestBody.handlers}
            channels={channelSpec ? channelSpec.channels : undefined}
            onChange={(newHandlers: NotificationHandler[]) => {
              setRequestBody({
                ...requestBody,
                handlers: newHandlers,
              });
            }}
            formattedJsonTemplate={templateJson}
            getInvalidRecipientText={(domains) =>
              t`You're only allowed to email alerts to addresses ending in ${domains}`
            }
          />
        </AlertModalSettingsBlock>
      </Stack>
      <Flex justify="flex-end" px="2.5rem" pt="lg" className={CS.borderTop}>
        <Button onClick={onClose} className={CS.mr2}>{t`Cancel`}</Button>
        <ButtonWithStatus
          titleForState={{
            default: isEditMode && hasChanges ? t`Save changes` : t`Done`,
          }}
          disabled={!isValid}
          onClickOperation={onCreateOrEditAlert}
        />
      </Flex>
    </Modal>
  );
};
