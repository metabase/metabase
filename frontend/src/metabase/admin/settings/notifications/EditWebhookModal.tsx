import { useMemo } from "react";
import { t } from "ttag";

import {
  useDeleteChannelMutation,
  useEditChannelMutation,
} from "metabase/api/channel";
import { Modal } from "metabase/ui";
import type { NotificationChannel } from "metabase-types/api";

import {
  WebhookForm,
  type WebhookFormProps,
  handleFieldError,
} from "./WebhookForm";
import { buildAuthInfo, channelToForm } from "./utils";

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
    return editChannel({
      id: channel.id,
      name: vals.name,
      description: vals.description,
      details: {
        url: vals.url,
        "fe-form-type": vals["fe-form-type"],
        "auth-method": vals["auth-method"],
        "auth-info": buildAuthInfo(vals),
      },
    })
      .unwrap()
      .then(() => {
        onClose();
      })
      .catch(e => {
        handleFieldError(e);
      });
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
      // "auth-info": channel.details["auth-info"] || { "": "" },
      "fe-form-type": channel.details["fe-form-type"],
      ...channelToForm(channel),
    }),
    [channel],
  );

  return (
    <Modal.Root opened={isOpen} onClose={onClose} size="36rem">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" mb="1.5rem">
          <Modal.Title>{t`Edit this webhook`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2.5rem">
          <WebhookForm
            onSubmit={handleSumbit}
            onCancel={onClose}
            onDelete={handleDelete}
            initialValues={initialValues}
            submitLabel={t`Save changes`}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
