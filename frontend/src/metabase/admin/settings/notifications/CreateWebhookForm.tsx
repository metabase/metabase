import { t } from "ttag";

import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Chip, Flex } from "metabase/ui";

const styles = {
  input: {
    fontWeight: 400,
  },
  label: {
    fontSize: "14px",
    marginBottom: "0.75rem",
  },
};

export type WebhookFormProps = {
  url: string;
  name: string;
  description: string;
  auth: "none" | "url" | "headers" | "body";
};

interface CreateWebhookFormProps {
  onSubmit: (props: WebhookFormProps) => void;
  onCancel: () => void;
}

export const CreateWebhookForm = ({
  onSubmit,
  onCancel,
}: CreateWebhookFormProps) => {
  return (
    <FormProvider
      initialValues={{
        url: "",
        name: "",
        description: "",
        auth: "none",
      }}
      onSubmit={onSubmit}
    >
      {({ dirty }) => (
        <Form>
          <Flex align="end" mb="1.5rem" gap="1rem">
            <FormTextInput
              name="url"
              label="Webhook URL"
              placeholder="http://hooks.example.com/hooks/catch/"
              styles={styles}
              style={{ flexGrow: 1 }}
              maw="21rem"
            />
            <Button h="2.5rem">{t`Send Test`}</Button>
          </Flex>
          <FormTextInput
            name="name"
            label="Give it a name"
            placeholder="Hooky McHookerson"
            styles={styles}
            mb="1.5rem"
            maw="14.5rem"
          />
          <FormTextInput
            name="description"
            label="Description"
            placeholder="Where is this going and what does it send?"
            styles={styles}
            mb="1.5rem"
            maw="21rem"
          />

          <FormChipGroup name="auth" label="Authentication method">
            <Chip value="none" variant="brand">
              None
            </Chip>
            <Chip value="url" variant="brand">
              Url params
            </Chip>
            <Chip value="header" variant="brand">
              HTTP headers
            </Chip>
            <Chip value="body" variant="brand">
              Request body
            </Chip>
          </FormChipGroup>
          {/* </FormRadioGroup> */}
          <Flex mt="1.5rem" justify="end" gap="0.75rem">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              disabled={!dirty}
              label={t`Create destination`}
              variant="filled"
            />
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};
