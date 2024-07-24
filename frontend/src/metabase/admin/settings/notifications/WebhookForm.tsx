import { useMemo, useState } from "react";
import { t } from "ttag";

import { useTestChannelMutation } from "metabase/api/channel";
import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { FormKeyValueMapping } from "metabase/forms/components/FormKeyValueMapping";
import { Button, Chip, Flex, Alert, Text, Group, Icon } from "metabase/ui";
import type { NotificationAuthMethods } from "metabase-types/api";

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

type TestStatus = null | "good" | "bad";

export const WebhookForm = ({
  onSubmit,
  onCancel,
  onDelete,
  initialValues,
}: {
  onSubmit: (props: WebhookFormProps) => void;
  onCancel: () => void;
  onDelete?: () => void;
  initialValues: WebhookFormProps;
}) => {
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [testChannel] = useTestChannelMutation();

  const handleTest = async (
    values: WebhookFormProps,
    setFieldError: (field: string, message: string | undefined) => void,
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
          setTestStatus("good");
          setFieldError("url", undefined);
        },
        e => {
          setTestStatus("bad");
          setFieldError("url", e.data);
        },
      );
  };

  const statusIcon = useMemo(() => {
    if (testStatus === null) {
      return null;
    }
    if (testStatus === "good") {
      return <Icon name="check" color="green" />;
    }
    if (testStatus === "bad") {
      return <Icon name="close" color="red" />;
    }
  }, [testStatus]);

  return (
    <FormProvider initialValues={initialValues} onSubmit={onSubmit}>
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
              rightIcon={statusIcon}
            >{t`Send a test`}</Button>
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
            <FormKeyValueMapping name="auth-info" label="Auth info" />
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
                label={t`Create destination`}
                variant="filled"
              />
            </Group>
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};
