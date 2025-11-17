import type { FormikHelpers } from "formik";
import { useMemo } from "react";
import { c, jt, t } from "ttag";
import * as Yup from "yup";

import { useTestChannelMutation } from "metabase/api/channel";
import ExternalLink from "metabase/common/components/ExternalLink";
import { useActionButtonLabel } from "metabase/common/hooks/use-action-button-label";
import {
  Form,
  FormChipGroup,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { getResponseErrorMessage } from "metabase/lib/errors";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import {
  Alert,
  Box,
  Button,
  Chip,
  Flex,
  Group,
  Icon,
  ScrollArea,
  Text,
  Title,
} from "metabase/ui";
import {
  type NotificationAuthMethods,
  type NotificationAuthType,
  isNotificationChannelTestErrorResponse,
} from "metabase-types/api";

import { buildAuthInfo } from "./utils";

const validationSchema = Yup.object({
  url: Yup.string()
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    .url(t`Please enter a correctly formatted URL`)
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    .required(t`Please enter a correctly formatted URL`),
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  name: Yup.string().required(t`Please add a name`),
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  description: Yup.string().required(t`Please add a description`),
  "auth-method": Yup.string()
    .required()
    .equals(["none", "header", "query-param", "request-body"]),
  "fe-form-type": Yup.string()
    .required()
    .equals(["none", "basic", "bearer", "api-key"]),
  "auth-info": Yup.object(),
});

const styles = {
  wrapperProps: {
    fw: 400,
  },
  labelProps: {
    fz: "0.875rem",
    mb: "0.75rem",
  },
};

export type WebhookFormProps = {
  url: string;
  name: string;
  description: string;
  "auth-method": NotificationAuthMethods;
  "auth-info-key"?: string;
  "auth-info-value"?: string;
  "auth-username"?: string;
  "auth-password"?: string;
  "fe-form-type": NotificationAuthType;
};

type WebhookFormikHelpers = FormikHelpers<WebhookFormProps>;

// Helper function to attempt to ensure that any error that comes back
// is in the shape that our FormSubmit logic expects. This controls
// highlighting the correct fields, etc. The shape can be hard to
// determine because we forward responses from alert targets
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

const renderAuthSection = (type: string) => {
  switch (type) {
    case "basic":
      return (
        <>
          <FormTextInput
            name="auth-username"
            label={t`Username`}
            placeholder="user@email.com"
            {...styles}
            mb="1.5rem"
          />
          <FormTextInput
            name="auth-password"
            label={t`Password`}
            placeholder="********"
            {...styles}
          />
        </>
      );
    case "bearer":
      return (
        <FormTextInput
          name="auth-info-value"
          label={t`Bearer token`}
          placeholder={t`Secret Token`}
          {...styles}
          mb="1.5rem"
        />
      );
    case "api-key":
      return (
        <Flex direction="column">
          <FormChipGroup
            name="auth-method"
            label={t`Add to`}
            groupProps={{ mb: "1.5rem", mt: "0.5rem" }}
          >
            <Chip value="header" variant="brand">
              {t`Header`}
            </Chip>
            <Chip value="query-param" variant="brand">
              {t`Query param`}
            </Chip>
          </FormChipGroup>
          <Flex gap="0.5rem">
            <FormTextInput
              name="auth-info-key"
              label={t`Key`}
              placeholder={t`X-API-KEY`}
              {...styles}
              mb="1.5rem"
            />
            <FormTextInput
              name="auth-info-value"
              label={t`Value`}
              placeholder={t`API Key Value`}
              {...styles}
            />
          </Flex>
        </Flex>
      );
    default:
      return null;
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
  const [testChannel, { error }] = useTestChannelMutation();

  const errorData = useMemo(() => {
    if (isNotificationChannelTestErrorResponse(error)) {
      return error.data.data;
    }
  }, [error]);

  const docsUrl = useSelector((state) =>
    getDocsUrl(state, { page: "questions/sharing/alerts" }),
  );

  const handleTest = async (
    values: WebhookFormProps,
    setFieldError: WebhookFormikHelpers["setFieldError"],
  ) => {
    await testChannel({
      details: {
        url: values.url,
        "auth-method": values["auth-method"],
        "auth-info": buildAuthInfo(values),
      },
    })
      .unwrap()
      .then(
        () => {
          setFieldError("url", undefined);
          setTestButtonLabel(t`Success`);
        },
        (e) => {
          setTestButtonLabel(t`Test failed`);
          const message =
            typeof e === "string" ? e : getResponseErrorMessage(e);

          setFieldError("url", message);
        },
      );
  };

  return (
    <FormProvider
      initialValues={initialValues}
      onSubmit={onSubmit}
      validationSchema={validationSchema}
    >
      {({ dirty, values, setFieldError, setFieldValue }) => (
        <Form>
          <Alert
            variant="light"
            mb="1.5rem"
            style={{ backgroundColor: "var(--mb-color-background-secondary)" }}
            px="1.5rem"
            py="1rem"
            radius="0.5rem"
          >
            <Text>{jt`You can send the payload of any Alert to this destination whenever the Alert is triggered. ${(
              <ExternalLink key="link" href={docsUrl}>
                {t`Learn about Alerts`}
              </ExternalLink>
            )}`}</Text>
          </Alert>
          <Box mb="1.5rem">
            <Flex align="end" gap="1rem">
              <FormTextInput
                name="url"
                label={t`Webhook URL`}
                placeholder="http://hooks.example.com/hooks/catch/"
                style={{ flexGrow: 1 }}
                {...styles}
                maw="21rem"
              />
              <Button
                h="2.5rem"
                onClick={() => handleTest(values, setFieldError)}
              >
                {testButtonLabel}
              </Button>
            </Flex>
            {!!errorData && (
              <ScrollArea.Autosize mah={200} mt="0.75rem">
                <Title order={6} mb="0.75rem" lh="1rem">
                  {c("The response returned by an API Request")
                    .t`Test response`}
                </Title>
                <Box
                  py="0.5rem"
                  px="1.5rem"
                  bg="background-secondary"
                  style={{ borderRadius: "0.5rem" }}
                  data-testid="notification-test-response"
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "0.75rem",
                      lineHeight: "1rem",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {JSON.stringify(errorData, null, 2)}
                  </pre>
                </Box>
              </ScrollArea.Autosize>
            )}
          </Box>

          <FormTextInput
            name="name"
            label={t`Give it a name`}
            placeholder={t`Something descriptive`}
            {...styles}
            mb="1.5rem"
            maw="14.5rem"
          />
          <FormTextInput
            name="description"
            label={t`Description`}
            placeholder={t`Where is this going and what does it send?`}
            {...styles}
            mb="1.5rem"
            maw="21rem"
          />
          <FormChipGroup
            name="fe-form-type"
            label={t`Authentication method`}
            groupProps={{ mb: "1.5rem", mt: "0.5rem" }}
            onChange={(val) => {
              if (val === "none") {
                setFieldValue("auth-method", "none");
              } else {
                setFieldValue("auth-method", "header");
              }
            }}
          >
            <Chip value="none" variant="brand">
              {t`None`}
            </Chip>
            <Chip value="basic" variant="brand">
              {t`Basic`}
            </Chip>
            <Chip value="bearer" variant="brand">
              {t`Bearer`}
            </Chip>
            <Chip value="api-key" variant="brand">
              {t`API Key`}
            </Chip>
          </FormChipGroup>

          {renderAuthSection(values["fe-form-type"])}

          <Flex
            mt="1.5rem"
            justify={onDelete ? "space-between" : "end"}
            gap="0.75rem"
          >
            {onDelete && (
              <Button
                variant="subtle"
                c="text-secondary"
                size="compact-md"
                pl="0"
                leftSection={<Icon name="trash" />}
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
