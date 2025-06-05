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
      .catch((e) => {
        handleFieldError(e);
        throw e;
      });
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      size="36rem"
      padding="2.5rem"
      title={t`New webhook destination`}
    >
      <WebhookForm
        onSubmit={handleSubmit}
        onCancel={onClose}
        initialValues={initialValues}
      />
    </Modal>
  );
};
