import { skipToken } from "@reduxjs/toolkit/query";
import cx from "classnames";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useGetDefaultNotificationTemplateQuery,
  useGetNotificationPayloadExampleQuery,
  useLazyPreviewNotificationTemplateQuery,
  useListChannelsQuery,
  usePreviewNotificationTemplateQuery,
  useUpdateNotificationMutation,
} from "metabase/api";
import ButtonWithStatus from "metabase/common/components/ButtonWithStatus";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { AutoWidthSelect } from "metabase/common/components/Schedule/AutoWidthSelect";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import CS from "metabase/css/core/index.css";
import { openInBlankWindow } from "metabase/lib/dom";
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
import { Button, Flex, Modal, Stack, rem } from "metabase/ui";
import type {
  ChannelApiResponse,
  ChannelTemplate,
  ConditionalAlertExpression,
  CreateTableNotificationRequest,
  NotificationChannelType,
  NotificationHandler,
  NotificationTriggerEvent,
  TableId,
  TableNotification,
  UpdateTableNotificationRequest,
  User,
  UserId,
} from "metabase-types/api";

import S from "./CreateOrEditTableNotificationModal.module.css";
import { AlertConditionBuilder } from "./components/AlertConditionBuilder/AlertConditionBuilder";
import { PreviewTemplatePanel } from "./components/PreviewTemplatePanel/PreviewTemplatePanel";

type TableNotificationTriggerOption = {
  value: {
    eventName: NotificationTriggerEvent;
  };
  get label(): string;
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

const triggerOptions = (
  [
    "event/row.created",
    "event/row.updated",
    "event/row.deleted",
  ] as NotificationTriggerEvent[]
).map((event) => ({
  value: event,
  label: NOTIFICATION_TRIGGER_OPTIONS_MAP[event].label,
  option: NOTIFICATION_TRIGGER_OPTIONS_MAP[event],
}));

interface CreateOrEditTableNotificationModalProps {
  tableId: TableId;
  notification?: TableNotification | null;
  onNotificationCreated?: () => void;
  onNotificationUpdated?: () => void;
  onClose: () => void;
}

// Custom hooks to encapsulate logic from the modal.
// Fetch necessary data.
const useNotificationTemplates = (
  requestBody:
    | CreateTableNotificationRequest
    | UpdateTableNotificationRequest
    | null,
  user: { id: UserId } | null,
) => {
  const channelTypes = useMemo(
    () =>
      requestBody?.handlers
        ? requestBody.handlers
            .map((h) => h.channel_type)
            .filter((type): type is NotificationChannelType => !!type)
        : [],
    [requestBody?.handlers],
  );

  const { data: defaultTemplates } = useGetDefaultNotificationTemplateQuery(
    requestBody?.payload_type &&
      requestBody?.payload?.event_name &&
      user &&
      channelTypes.length > 0
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

  const { data: templateContext } = useGetNotificationPayloadExampleQuery(
    requestBody?.payload_type &&
      requestBody?.payload?.event_name &&
      user &&
      channelTypes.length > 0
      ? {
          notification: {
            payload_type: requestBody.payload_type,
            payload: requestBody.payload,
            creator_id: user.id,
          },
          channel_types: channelTypes,
        }
      : skipToken,
    {
      skip: !requestBody?.payload?.event_name || channelTypes.length === 0,
    },
  );

  return {
    defaultTemplates,
    templateContext,
  };
};

const useNotificationFormState = (
  tableId: TableId,
  notification: TableNotification | null,
  user: User | null,
  channelSpec: ChannelApiResponse | undefined,
  userCanAccessSettings: boolean,
) => {
  const { data: hookChannels } = useListChannelsQuery();
  const [requestBody, setRequestBody] = useState<
    CreateTableNotificationRequest | UpdateTableNotificationRequest | null
  >(null);

  useEffect(() => {
    // Ensure all required data is loaded before initializing
    if (!requestBody && user && channelSpec && hookChannels) {
      const eventName: NotificationTriggerEvent =
        notification?.payload.event_name ?? "event/row.created";
      const initialRequestBody = getDefaultTableNotificationRequest({
        tableId,
        eventName,
        currentUserId: user.id,
        channelSpec,
        hookChannels,
        userCanAccessSettings,
      });
      // If editing, merge existing notification data
      if (notification) {
        setRequestBody({ ...initialRequestBody, ...notification });
      } else {
        setRequestBody(initialRequestBody);
      }
    }
  }, [
    tableId,
    notification,
    requestBody,
    user,
    channelSpec,
    hookChannels,
    userCanAccessSettings,
  ]);

  const handleEventNameChange = useCallback((value: string | null) => {
    if (value) {
      const selectedOption =
        NOTIFICATION_TRIGGER_OPTIONS_MAP[value as NotificationTriggerEvent];
      if (selectedOption) {
        setRequestBody((requestBody) =>
          requestBody
            ? {
                ...requestBody,
                payload: {
                  ...requestBody.payload,
                  event_name: selectedOption.value.eventName,
                },
              }
            : null,
        );
      }
    }
  }, []);

  const handleChannelHandlersChange = useCallback(
    (newHandlers: NotificationHandler[]) => {
      setRequestBody((requestBody) =>
        requestBody
          ? {
              ...requestBody,
              handlers: newHandlers,
            }
          : null,
      );
    },
    [],
  );

  const handleConditionChange = useCallback(
    (newCondition: ConditionalAlertExpression) => {
      setRequestBody((requestBody) =>
        requestBody
          ? {
              ...requestBody,
              condition: newCondition,
            }
          : null,
      );
    },
    [],
  );

  return {
    requestBody,
    handleEventNameChange,
    handleChannelHandlersChange,
    handleConditionChange,
  };
};

// Manage the preview panel state and data fetching
const useNotificationTemplatePreview = (
  requestBody:
    | CreateTableNotificationRequest
    | UpdateTableNotificationRequest
    | null,
  defaultTemplates:
    | Record<NotificationChannelType, ChannelTemplate>
    | undefined,
) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<{
    notification:
      | CreateTableNotificationRequest
      | UpdateTableNotificationRequest;
    template: ChannelTemplate;
  } | null>(null);

  const {
    data: previewData,
    isLoading: isPreviewLoading,
    error: previewError,
  } = usePreviewNotificationTemplateQuery(previewRequest ?? skipToken, {
    skip: !previewRequest,
  });
  const [fetchPreview] = useLazyPreviewNotificationTemplateQuery();

  const handlePreviewClick = useCallback(
    async (channelType: NotificationChannelType) => {
      if (previewOpen && channelType === "channel/email") {
        setPreviewOpen(false);
        setPreviewRequest(null);
        return;
      }

      let previewRequest = null;
      if (requestBody && channelType) {
        const handler = requestBody.handlers.find(
          (h) => h.channel_type === channelType && h.template,
        );
        const currentTemplate =
          handler?.template || defaultTemplates?.[channelType];

        if (currentTemplate) {
          previewRequest = {
            notification: requestBody,
            template: currentTemplate,
          };
        }
      }

      if (channelType === "channel/email") {
        setPreviewOpen(true);
        setPreviewRequest(previewRequest);
      }

      if (channelType === "channel/slack" && previewRequest) {
        const { data } = await fetchPreview(previewRequest);
        if (data?.preview_url) {
          openInBlankWindow(data.preview_url);
        }
      }
    },
    [defaultTemplates, fetchPreview, previewOpen, requestBody],
  );

  const handlePreviewClose = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  return {
    previewOpen,
    previewData,
    isPreviewLoading,
    previewError,
    handlePreviewClick,
    handlePreviewClose,
  };
};

// Manage saving/updating and the confirmation modal
const useNotificationSave = (
  requestBody:
    | CreateTableNotificationRequest
    | UpdateTableNotificationRequest
    | null,
  notification: TableNotification | null,
  isEditMode: boolean,
  onNotificationCreated?: () => void,
  onNotificationUpdated?: () => void,
) => {
  const dispatch = useDispatch();
  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();

  const hasChanges = useMemo(
    () => notification && !isEqual(requestBody, notification),
    [requestBody, notification],
  );

  const onCreateOrEditAlert = useCallback(async () => {
    if (!requestBody) {
      return;
    }

    try {
      if (isEditMode && notification) {
        await updateNotification({
          ...requestBody,
          id: notification.id,
        } as UpdateTableNotificationRequest);
        dispatch(
          addUndo({
            message: isEditMode ? t`Alert updated.` : t`Alert created.`,
          }),
        );

        if (isEditMode) {
          onNotificationUpdated?.();
        } else {
          onNotificationCreated?.();
        }
      } else {
        await createNotification(requestBody as CreateTableNotificationRequest);
        dispatch(
          addUndo({
            message: isEditMode ? t`Alert updated.` : t`Alert created.`,
          }),
        );
        onNotificationCreated?.();
      }
    } catch (error) {
      console.error("Failed to save notification:", error);
      throw error;
    }
  }, [
    requestBody,
    isEditMode,
    notification,
    updateNotification,
    createNotification,
    dispatch,
    onNotificationCreated,
    onNotificationUpdated,
  ]);

  return {
    hasChanges,
    onCreateOrEditAlert,
  };
};

export const CreateOrEditTableNotificationModal = ({
  tableId,
  notification,
  onNotificationCreated,
  onNotificationUpdated,
  onClose,
}: CreateOrEditTableNotificationModalProps) => {
  const user = useSelector(getUser);
  const userCanAccessSettings = useSelector(canAccessSettings);
  const isEditMode = !!notification?.id;

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();

  const {
    requestBody,
    handleEventNameChange,
    handleChannelHandlersChange,
    handleConditionChange,
  } = useNotificationFormState(
    tableId,
    notification ?? null,
    user,
    channelSpec,
    userCanAccessSettings,
  );

  const { defaultTemplates, templateContext } = useNotificationTemplates(
    requestBody,
    user,
  );

  const {
    previewOpen,
    previewData,
    isPreviewLoading,
    previewError,
    handlePreviewClick,
    handlePreviewClose,
  } = useNotificationTemplatePreview(requestBody, defaultTemplates);

  const { hasChanges, onCreateOrEditAlert } = useNotificationSave(
    requestBody,
    notification ?? null,
    isEditMode,
    onNotificationCreated,
    onNotificationUpdated,
  );

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const handleCloseAttempt = useCallback(() => {
    if (isConfirmModalOpen) {
      return;
    }

    if (hasChanges) {
      setIsConfirmModalOpen(true);
    } else {
      onClose();
    }
  }, [hasChanges, onClose, isConfirmModalOpen]);

  const handleConfirmDiscard = useCallback(() => {
    setIsConfirmModalOpen(false);
    onClose();
  }, [onClose]);

  useEscapeToCloseModal(handleCloseAttempt, { capture: false });

  const hasConfiguredAnyChannel = useMemo(
    () => getHasConfiguredAnyChannel(channelSpec),
    [channelSpec],
  );
  const hasConfiguredEmailChannel = useMemo(
    () => getHasConfiguredEmailChannel(channelSpec),
    [channelSpec],
  );

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

  return (
    <Modal
      data-testid="table-notification-create"
      opened
      size={previewOpen ? rem(1360) : rem(680)}
      onClose={handleCloseAttempt}
      padding="2.5rem"
      closeOnEscape={false}
      title={isEditMode ? t`Edit alert` : t`New alert`}
      maw="90%"
      classNames={{
        header: S.modalHeader,
        content: S.modalContent,
        body: S.modalBody,
        close: S.modalClose,
      }}
    >
      <div
        className={cx(
          S.root,
          previewOpen ? S.rootPreviewOpen : S.rootNoPreview,
        )}
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
                    handleEventNameChange(value);
                  }
                }}
              />
            </Flex>
            <Flex mt="md">
              <AlertConditionBuilder
                tableId={tableId}
                eventType={requestBody?.payload.event_name}
                onChange={handleConditionChange}
                initialExpression={notification?.condition}
              />
            </Flex>
          </AlertModalSettingsBlock>
          <AlertModalSettingsBlock
            title={t`Where do you want to send the alerts?`}
            contentProps={{
              style: {
                // To display autocomplete popovers properly.
                overflow: "visible",
              },
            }}
          >
            <NotificationChannelsPicker
              enableTemplates={{ email: true, slack: true }}
              notificationHandlers={requestBody.handlers}
              channels={channelSpec ? channelSpec.channels : undefined}
              onChange={handleChannelHandlersChange}
              templateContext={templateContext}
              defaultTemplates={defaultTemplates}
              onPreviewClick={handlePreviewClick}
              isPreviewOpen={previewOpen}
              getInvalidRecipientText={(domains) =>
                t`You're only allowed to email alerts to addresses ending in ${domains}`
              }
            />
          </AlertModalSettingsBlock>
        </Stack>

        {previewOpen && (
          <PreviewTemplatePanel
            onClose={handlePreviewClose}
            isLoading={isPreviewLoading}
            error={previewError}
            previewContent={previewData?.rendered}
          />
        )}
      </div>
      <Flex
        h="5.5rem"
        justify="flex-end"
        px="2.5rem"
        py="lg"
        className={cx(CS.borderTop, S.modalFooter)}
      >
        <Button
          onClick={handleCloseAttempt}
          className={CS.mr2}
        >{t`Cancel`}</Button>
        <ButtonWithStatus
          titleForState={{
            default: isEditMode && hasChanges ? t`Save changes` : t`Done`,
          }}
          disabled={
            !alertIsValid(requestBody.handlers, channelSpec) ||
            (isEditMode && !hasChanges)
          }
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
          closeOnEscape={false}
        />
      )}
    </Modal>
  );
};
