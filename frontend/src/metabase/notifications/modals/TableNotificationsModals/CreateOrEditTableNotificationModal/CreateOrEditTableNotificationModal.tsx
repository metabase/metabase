import { skipToken } from "@reduxjs/toolkit/query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useGetDefaultNotificationTemplateQuery,
  useGetNotificationPayloadExampleMutation,
  useListChannelsQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import { ConfirmModal } from "metabase/components/ConfirmModal";
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
import type { SupportedChannelKey } from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsPicker/NotificationChannelsPicker";
import { NotificationChannelsPicker } from "metabase/notifications/modals/shared/components/NotificationChannels/NotificationChannelsPicker/NotificationChannelsPicker";
import { getDefaultTableNotificationRequest } from "metabase/notifications/utils";
import { addUndo } from "metabase/redux/undo";
import { canAccessSettings, getUser } from "metabase/selectors/user";
import { Button, Flex, Icon, Modal, Stack, Text, rem } from "metabase/ui";
import type {
  CreateTableNotificationRequest,
  NotificationHandler,
  NotificationTriggerEvent,
  TableId,
  TableNotification,
  UpdateTableNotificationRequest,
} from "metabase-types/api";

type TableNotificationTriggerOption = {
  value: {
    eventName: NotificationTriggerEvent;
  };
  get label(): string;
};

const formatJsonForTooltip = (json: any) => {
  return json ? JSON.stringify(json, null, 2) : "";
};

const NOTIFICATION_TRIGGER_OPTIONS_MAP: Record<
  NotificationTriggerEvent,
  TableNotificationTriggerOption
> = {
  "event/row.created": {
    value: {
      eventName: "event/row.created",
    },
    get label() {
      return t`When new records are created`;
    },
  },
  "event/row.updated": {
    value: {
      eventName: "event/row.updated",
    },
    get label() {
      return t`When any cell changes it's value`;
    },
  },
  "event/row.deleted": {
    value: {
      eventName: "event/row.deleted",
    },
    get label() {
      return t`When records are deleted`;
    },
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

interface PreviewMessagePanelProps {
  opened: boolean;
  onClose: () => void;
  channelType?: SupportedChannelKey;
}

const PreviewMessagePanel = ({
  opened,
  onClose,
  channelType,
}: PreviewMessagePanelProps) => {
  if (!opened) {
    return null;
  }

  return (
    <Flex
      direction="column"
      h="100%"
      w="50%"
      style={{
        // position: "absolute",
        // right: 0,
        // top: 0,
        // bottom: 0,
        height: "100%",
        borderLeft: "1px solid red",
        flexGrow: 1,
        // backgroundColor: "white",
        // zIndex: 10,
      }}
    >
      <Flex
        p="md"
        // justify="space-between"
        gap="1rem"
        align="center"
        style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}
      >
        <Icon
          name="close"
          size={16}
          style={{ cursor: "pointer" }}
          onClick={onClose}
        />
        <Text fw={600} size="lg">{t`Preview Message`}</Text>
      </Flex>
      <Flex p="md" direction="column" style={{ flex: 1, overflow: "auto" }}>
        {channelType && (
          <Text size="sm" c="dimmed">
            {channelType === "email"
              ? t`Email preview will be displayed here`
              : t`Slack message preview will be displayed here`}
          </Text>
        )}
      </Flex>
    </Flex>
  );
};

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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewChannelType, setPreviewChannelType] = useState<
    SupportedChannelKey | undefined
  >();

  const [requestBody, setRequestBody] = useState<
    CreateTableNotificationRequest | UpdateTableNotificationRequest | null
  >(null);
  console.log(notification, requestBody);

  // State to store the template JSON for the current event_name
  const [templateJson, setTemplateJson] = useState<string>("");

  // Compute channel types for template query
  const channelTypes = requestBody?.handlers
    ? requestBody.handlers
        .map((h) => h.channel_type)
        .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
    : [];

  // Use query hook for default templates (enabled only when event and handlers are present)
  const { data: defaultTemplates } = useGetDefaultNotificationTemplateQuery(
    requestBody?.payload?.event_name && channelTypes.length > 0
      ? {
          notification: {
            payload_type: requestBody.payload_type,
            payload: requestBody.payload,
          },
          channel_types: channelTypes,
        }
      : skipToken,
    {
      skip: !requestBody?.payload?.event_name || channelTypes.length === 0,
    },
  );

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
      (
        [
          "event/row.created",
          "event/row.updated",
          "event/row.deleted",
        ] as NotificationTriggerEvent[]
      ).map((event) => ({
        value: event,
        label: NOTIFICATION_TRIGGER_OPTIONS_MAP[event].label,
        option: NOTIFICATION_TRIGGER_OPTIONS_MAP[event],
      })),
    [],
  );

  useEffect(() => {
    if (tableId && channelSpec && user && hookChannels && !requestBody) {
      const defaultOption =
        NOTIFICATION_TRIGGER_OPTIONS_MAP["event/row.created"];
      setRequestBody(
        isEditMode
          ? { ...notification }
          : getDefaultTableNotificationRequest({
              tableId,
              eventName: defaultOption.value.eventName,
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

  // Get example payload when event changes
  useEffect(() => {
    const fetchExamplePayload = async () => {
      if (!requestBody?.payload?.event_name || !user) {
        return;
      }

      const result = await getNotificationPayloadExample({
        payload_type: "notification/system-event",
        payload: {
          event_name: requestBody.payload.event_name,
        },
        creator_id: user.id,
      });

      if (result.data) {
        setTemplateJson(formatJsonForTooltip(result.data.payload));
      }
    };

    fetchExamplePayload();
  }, [getNotificationPayloadExample, requestBody?.payload?.event_name, user]);

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
            message: t`Failed to save alert.`,
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

  const hasChanges = useMemo(
    () => !isEqual(requestBody, notification),
    [requestBody, notification],
  );

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const handleCloseAttempt = useCallback(() => {
    if (hasChanges) {
      setIsConfirmModalOpen(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setIsConfirmModalOpen(false);
    onClose();
  }, [onClose]);
  useEscapeToCloseModal(handleCloseAttempt, { capture: false });

  const handlePreviewClick = useCallback((channelType: SupportedChannelKey) => {
    setPreviewChannelType(channelType);
    setPreviewOpen(true);
  }, []);

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
    setPreviewChannelType(undefined);
  }, []);

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

  return (
    <Modal
      data-testid="table-notification-create"
      opened
      // size={previewOpen ? "calc(180% + 2rem)" : "xl"}
      size={previewOpen ? rem(900) : rem(600)}
      onClose={handleCloseAttempt}
      padding="2.5rem"
      closeOnEscape={false}
      title={isEditMode ? t`Edit alert` : t`New alert`}
      styles={{
        body: {
          paddingLeft: 0,
          paddingRight: 0,
          // position: "relative",
        },
        // inner: {
        //   transition: "width 0.3s ease",
        // },
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: previewOpen ? "1fr 1fr" : "1fr",
          transition: "grid-template-columns 0.3s ease",
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
                value={requestBody.payload.event_name}
                onChange={(value) => {
                  if (value) {
                    const selectedOption =
                      NOTIFICATION_TRIGGER_OPTIONS_MAP[
                        value as NotificationTriggerEvent
                      ];
                    if (selectedOption) {
                      setRequestBody({
                        ...requestBody,
                        payload: {
                          ...requestBody.payload,
                          event_name: selectedOption.value.eventName,
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
            contentProps={{ style: { overflow: "visible" } }}
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
              defaultTemplates={defaultTemplates}
              // onPreviewClick={handlePreviewClick}
              getInvalidRecipientText={(domains) =>
                t`You're only allowed to email alerts to addresses ending in ${domains}`
              }
            />
          </AlertModalSettingsBlock>
        </Stack>

        {/* Preview Message Panel */}
        {previewOpen && (
          <PreviewMessagePanel
            opened={true}
            onClose={handlePreviewClose}
            channelType={previewChannelType}
          />
        )}
      </div>
      <Flex justify="flex-end" px="2.5rem" pt="lg" className={CS.borderTop}>
        <Button
          onClick={handleCloseAttempt}
          className={CS.mr2}
        >{t`Cancel`}</Button>
        <ButtonWithStatus
          titleForState={{
            default: isEditMode && hasChanges ? t`Save changes` : t`Done`,
          }}
          disabled={!isValid}
          onClickOperation={onCreateOrEditAlert}
        />
      </Flex>

      {hasChanges && (
        <ConfirmModal
          size="md"
          opened={isConfirmModalOpen}
          title={t`Discard unsaved changes?`}
          message={t`You have unsaved changes. Are you sure you want to discard them?`}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={handleConfirmDiscard}
          confirmButtonText={t`Discard`}
          closeButtonText={t`Cancel`}
          confirmButtonPrimary={false}
        />
      )}
    </Modal>
  );
};
