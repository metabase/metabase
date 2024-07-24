import { useMemo } from "react";
import { t } from "ttag";

import {
  useDeleteChannelMutation,
  useEditChannelMutation,
} from "metabase/api/channel";
import { Modal } from "metabase/ui";
import type { NotificationChannel } from "metabase-types/api";

import { WebhookForm, type WebhookFormProps } from "./WebhookForm";

interface CreateWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
  channel: NotificationChannel;
}

export const EditWebhookModal = ({
  isOpen,
  onClose,
  channel,
}: CreateWebhookModalProps) => {
  const [editChannel] = useEditChannelMutation();
  const [deleteChannel] = useDeleteChannelMutation();

  const handleSumbit = async (vals: WebhookFormProps) => {
    await editChannel({
      id: channel.id,
      name: vals.name,
      description: vals.description,
      details: {
        url: vals.url,
        "auth-method": vals["auth-method"],
        "auth-info": vals["auth-info"],
      },
    }).unwrap();

    onClose();
  };

  const handleDelete = async () => {
    await deleteChannel(channel.id).unwrap();

    onClose();
  };

  const initialValues = useMemo(
    () => ({
      url: channel.details.url,
      name: channel.name,
      description: channel.description,
      "auth-method": channel.details["auth-method"],
      "auth-info": channel.details["auth-info"] || { "": "" },
    }),
    [channel],
  );

  return (
    <Modal.Root opened={isOpen} onClose={onClose} size="36rem">
      <Modal.Overlay />
      <Modal.Content p="1rem">
        <Modal.Header mb="1.5rem">
          <Modal.Title>{t`Edit this webhook`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <WebhookForm
            onSubmit={handleSumbit}
            onCancel={onClose}
            onDelete={handleDelete}
            initialValues={initialValues}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
