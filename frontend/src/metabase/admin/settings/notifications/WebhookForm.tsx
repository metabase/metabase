import type { FormikHelpers } from "formik";
import { t } from "ttag";
import * as Yup from "yup";

import { useTestChannelMutation } from "metabase/api/channel";
import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { FormKeyValueMapping } from "metabase/forms/components/FormKeyValueMapping";
import { useActionButtonLabel } from "metabase/hooks/use-action-button-label";
import { Button, Chip, Flex, Alert, Text, Group, Icon } from "metabase/ui";
import type { NotificationAuthMethods } from "metabase-types/api";

const validationSchema = Yup.object({
  url: Yup.string()
    .url(t`Please enter a correctly formatted URL`)
    .required(),
  name: Yup.string().required(t`Please add a name`),
  description: Yup.string().required(t`Please add a description`),
  "auth-method": Yup.string()
    .required()
    .equals(["none", "header", "query-param", "request-body"]),
  "auth-info": Yup.object(),
});

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
  "auth-method": NotificationAuthMethods;
  "auth-info": Record<string, string>;
};

type WebhookFormikHelpers = FormikHelpers<WebhookFormProps>;

export const handleFieldError = (e: any) => {
  if (!e.data) {
    return;
  } else if (typeof e.data === "string") {
    throw { data: { errors: { url: e.data } } };
  } else if (e.data.message) {
    throw { data: { errors: { url: e.data.message } } };
  } else if (typeof e.data.errors === "object") {
    throw e;
  }
};

export const WebhookForm = ({
  onSubmit,
  onCancel,
  onDelete,
  initialValues,
  submitLabel = t`Create destination`,
}: {
  onSubmit: (props: WebhookFormProps) => void;
  onCancel: () => void;
  onDelete?: () => void;
  initialValues: WebhookFormProps;
  submitLabel?: string;
}) => {
  const { label: testButtonLabel, setLabel: setTestButtonLabel } =
    useActionButtonLabel({ defaultLabel: t`Send a test` });
  const [testChannel] = useTestChannelMutation();

  const handleTest = async (
    values: WebhookFormProps,
    setFieldError: WebhookFormikHelpers["setFieldError"],
  ) => {
    await testChannel({
      details: {
        url: values.url,
        "auth-method": values["auth-method"],
        "auth-info": values["auth-info"],
      },
    })
      .unwrap()
      .then(
        () => {
          setFieldError("url", undefined);
          setTestButtonLabel(t`Success`);
        },
        e => {
          setTestButtonLabel(t`Test failed`);
          if (typeof e === "string") {
            setFieldError("url", e);
          } else if (typeof e.data === "string") {
            setFieldError("url", e.data);
          } else if (e.data?.message) {
            setFieldError("url", e.data.message);
          }
        },
      );
  };

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={onSubmit}
      validationSchema={validationSchema}
    >
      {({ dirty, values, setFieldError }) => (
        <Form>
          <Alert
            variant="light"
            mb="1.5rem"
            style={{ backgroundColor: "var(--mb-color-bg-light)" }}
            px="1.5rem"
            py="1rem"
            radius="0.5rem"
          >
            <Text>{t`You can send the payload of any Alert to this destination whenever the Alert is triggered. Learn about Alerts`}</Text>
          </Alert>
          <Flex align="end" mb="1.5rem" gap="1rem">
            <FormTextInput
              name="url"
              label="Webhook URL"
              placeholder="http://hooks.example.com/hooks/catch/"
              styles={styles}
              style={{ flexGrow: 1 }}
              maw="21rem"
            />
            <Button
              h="2.5rem"
              onClick={() => handleTest(values, setFieldError)}
            >
              {testButtonLabel}
            </Button>
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
          <FormChipGroup
            name="auth-method"
            label="Authentication method"
            groupProps={{ mb: "1.5rem" }}
          >
            <Chip value="none" variant="brand">
              None
            </Chip>
            <Chip value="query-param" variant="brand">
              Url params
            </Chip>
            <Chip value="header" variant="brand">
              HTTP headers
            </Chip>
            <Chip value="request-body" variant="brand">
              Request body
            </Chip>
          </FormChipGroup>
          {values["auth-method"] !== "none" && (
            <FormKeyValueMapping
              name="auth-info"
              label="Auth info"
              mappingEditorProps={{ addButtonProps: { pl: 0 } }}
            />
          )}
          <Flex
            mt="1.5rem"
            justify={onDelete ? "space-between" : "end"}
            gap="0.75rem"
          >
            {onDelete && (
              <Button
                variant="subtle"
                c="var(--mb-color-text-medium)"
                compact
                pl="0"
                leftIcon={<Icon name="trash" />}
                onClick={onDelete}
              >{t`Delete this destination`}</Button>
            )}
            <Group>
              <Button onClick={onCancel}>{t`Cancel`}</Button>
              <FormSubmitButton
                disabled={!dirty}
                label={submitLabel}
                variant="filled"
              />
            </Group>
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};
