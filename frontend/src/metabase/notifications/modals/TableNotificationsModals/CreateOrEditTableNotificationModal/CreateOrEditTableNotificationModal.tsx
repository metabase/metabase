import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
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
  CreateTableNotificationRequest,
  NotificationHandler,
  SystemEvent,
  TableId,
  TableNotification,
  UpdateTableNotificationRequest,
} from "metabase-types/api";

import type { TableNotificationTriggerOption } from "./types";

const NOTIFICATION_TRIGGER_OPTIONS_MAP: Record<
  SystemEvent,
  TableNotificationTriggerOption
> = {
  "event/data-editing-row-create": {
    value: "event/data-editing-row-create",
    label: t`When new table record is created`,
  },
  "event/data-editing-row-update": {
    value: "event/data-editing-row-update",
    label: t`When table record is updated`,
  },
  "event/data-editing-row-delete": {
    value: "event/data-editing-row-delete",
    label: t`When table record is deleted`,
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
  // console.log({ requestBody });

  const isEditMode = !!notification;
  const subscription = requestBody?.subscriptions[0];

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();
  const { data: hookChannels } = useListChannelsQuery();

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  const triggerOptions = useMemo(
    () =>
      Object.keys(NOTIFICATION_TRIGGER_OPTIONS_MAP).map(
        trigger => NOTIFICATION_TRIGGER_OPTIONS_MAP[trigger as SystemEvent],
      ),
    [],
  );

  useEffect(() => {
    if (tableId && channelSpec && user && hookChannels && !requestBody) {
      setRequestBody(
        isEditMode
          ? { ...notification }
          : getDefaultTableNotificationRequest({
              tableId,
              eventName: triggerOptions[0].value,
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

  if (!requestBody || !subscription) {
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
      title={isEditMode ? t`Edit notification` : t`New notification`}
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
              value={subscription.event_name}
              onChange={value => {
                if (value) {
                  setRequestBody({
                    ...requestBody,
                    subscriptions: [
                      {
                        ...subscription,
                        event_name: value,
                      },
                    ],
                  });
                }
              }}
            />
          </Flex>
        </AlertModalSettingsBlock>
        <AlertModalSettingsBlock
          title={t`Where do you want to send the notifications?`}
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
            emailRecipientText={t`Email notifications to:`}
            getInvalidRecipientText={domains =>
              t`You're only allowed to email notifications to addresses ending in ${domains}`
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
