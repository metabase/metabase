import { t } from "ttag";

import { useCreateChannelMutation } from "metabase/api/channel";
import { Modal } from "metabase/ui";

import {
  WebhookForm,
  type WebhookFormProps,
  handleFieldError,
} from "./WebhookForm";
import { buildAuthInfo } from "./utils";

interface CreateWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialValues = {
  url: "",
  name: "",
  description: "",
  "auth-method": "none" as const,
  "fe-form-type": "none" as const,
};

export const CreateWebhookModal = ({
  isOpen,
  onClose,
}: CreateWebhookModalProps) => {
  const [createChannel] = useCreateChannelMutation();
  const handleSubmit = async (vals: WebhookFormProps) => {
    return createChannel({
      name: vals.name,
      type: "channel/http",
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
        throw e;
      });
  };

  return (
    <Modal.Root opened={isOpen} onClose={onClose} size="36rem">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header p="2.5rem" mb="1.5rem">
          <Modal.Title>{t`New webhook destination`}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p="2.5rem">
          <WebhookForm
            onSubmit={handleSubmit}
            onCancel={onClose}
            initialValues={initialValues}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
};
