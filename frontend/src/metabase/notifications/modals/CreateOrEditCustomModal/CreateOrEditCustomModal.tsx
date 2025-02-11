import { useEffect, useState } from "react";
import { t } from "ttag";
import { isEqual } from "underscore";

import {
  useCreateNotificationMutation,
  useGetChannelInfoQuery,
  useListChannelsQuery,
  useSendUnsavedNotificationMutation,
  useUpdateNotificationMutation,
} from "metabase/api";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import CS from "metabase/css/core/index.css";
import {
  getHasConfiguredAnyChannel,
  getHasConfiguredEmailChannel,
} from "metabase/lib/pulse";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { NotificationChannelsPicker } from "metabase/notifications/modals/components/NotificationChannelsPicker";
import { addUndo } from "metabase/redux/undo";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Button, Flex, Modal, Select, Stack, rem } from "metabase/ui";
import type { Notification, NotificationHandler } from "metabase-types/api";

import { ChannelSetupModal } from "../ChannelSetupModal";
import { AlertModalSettingsBlock } from "../CreateOrEditQuestionAlertModal/AlertModalSettingsBlock";

type CreateOrEditCustomModalProps = {
  onClose: () => void;
} & (
  | {
      editingNotification?: undefined;
      onNotificationCreated: () => void;
      onNotificationUpdated?: () => void;
    }
  | {
      editingNotification: Notification;
      onNotificationUpdated: () => void;
      onNotificationCreated?: () => void;
    }
);

const SUBSCRIPTION_OPTIONS = [
  { value: "event/table-mutation-cell-update", label: t`Update` },
  { value: "event/table-mutation-row-insert", label: t`Insert` },
];

export const CreateOrEditCustomModal = ({
  editingNotification,
  onNotificationCreated,
  onNotificationUpdated,
  onClose,
}: CreateOrEditCustomModalProps) => {
  const dispatch = useDispatch();
  const user = useSelector(getUser);
  const isAdmin = useSelector(getUserIsAdmin);

  const [notification, setNotification] = useState<Notification | null>(null);

  const isEditMode = !!editingNotification;

  const { data: channelSpec, isLoading: isLoadingChannelInfo } =
    useGetChannelInfoQuery();
  const { data: hookChannels } = useListChannelsQuery();

  const [createNotification] = useCreateNotificationMutation();
  const [updateNotification] = useUpdateNotificationMutation();
  const [sendUnsavedNotification, { isLoading }] =
    useSendUnsavedNotificationMutation();

  const hasConfiguredAnyChannel = getHasConfiguredAnyChannel(channelSpec);
  const hasConfiguredEmailChannel = getHasConfiguredEmailChannel(channelSpec);

  useEffect(() => {
    if (channelSpec && user && hookChannels && !notification) {
      setNotification(
        isEditMode
          ? { ...editingNotification }
          : {
              handlers: [],
              payload_type: "notification/system-event",
              subscriptions: [{ type: "system-event", value: "update" }],
            },
      );
    }
  }, [
    notification,
    channelSpec,
    user,
    editingNotification,
    isEditMode,
    hookChannels,
  ]);

  const onCreateOrEdit = async () => {
    if (notification) {
      let result;

      if (isEditMode) {
        result = await updateNotification(notification);
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
        throw result.error;
      }

      dispatch(
        addUndo({
          message: isEditMode
            ? t`Your notification was updated.`
            : t`Your notification is all set up.`,
        }),
      );

      if (isEditMode) {
        onNotificationUpdated();
      } else {
        onNotificationCreated();
      }
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

  const channelRequirementsMet = isAdmin
    ? hasConfiguredAnyChannel
    : hasConfiguredEmailChannel;

  if (!isLoadingChannelInfo && channelSpec && !channelRequirementsMet) {
    return <ChannelSetupModal isAdmin={isAdmin} onClose={onClose} />;
  }

  if (!notification) {
    return null;
  }

  const isValid = notification.handlers.length > 0; // Add your validation logic
  const hasChanges = !isEqual(editingNotification, notification);

  return (
    <Modal.Root opened size={rem(680)} onClose={onClose}>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" pb="2rem">
          <Modal.Title>
            {isEditMode ? t`Edit notification` : t`New notification`}
          </Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2.5rem">
          <Stack spacing="2.5rem">
            <AlertModalSettingsBlock
              title={t`What events do you want to be notified about?`}
            >
              <Select
                value={notification.subscriptions?.[0]?.event_name || "update"}
                data={SUBSCRIPTION_OPTIONS}
                onChange={(value: string) =>
                  setNotification({
                    ...notification,
                    subscriptions: [
                      {
                        type: "notification-subscription/system-event",
                        event_name: value,
                      },
                    ],
                  })
                }
              />
            </AlertModalSettingsBlock>

            <AlertModalSettingsBlock
              title={t`Where do you want to send the notification?`}
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
                emailRecipientText={t`Email notifications to:`}
                getInvalidRecipientText={domains =>
                  t`You're only allowed to email notifications to addresses ending in ${domains}`
                }
              />
            </AlertModalSettingsBlock>
          </Stack>
        </Modal.Body>
        <Flex
          justify="space-between"
          px="2.5rem"
          py="1.5rem"
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
              onClickOperation={onCreateOrEdit}
            />
          </div>
        </Flex>
      </Modal.Content>
    </Modal.Root>
  );
};
