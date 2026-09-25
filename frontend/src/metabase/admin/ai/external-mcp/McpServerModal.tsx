import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import type {
  CreateMcpServerRequest,
  McpServer,
  McpServerAuthStrategy,
} from "metabase-types/api";

import {
  useCreateMcpServerMutation,
  useUpdateMcpServerMutation,
} from "../../settings/api/mcp-client";

import { type McpServerPreset, getAuthStrategyOptions } from "./presets";

interface FormValues {
  name: string;
  url: string;
  auth_strategy: McpServerAuthStrategy;
  header_name: string;
  header_value: string;
}

const getValidationSchema = (isEditing: boolean) =>
  Yup.object({
    name: Yup.string().required(t`Name is required`),
    url: Yup.string()
      .required(t`URL is required`)
      .matches(/^https?:\/\/\S+$/, t`Enter the server's full http(s) URL`),
    auth_strategy: Yup.mixed<McpServerAuthStrategy>()
      .oneOf(["oauth", "header", "none"])
      .required(),
    header_name: Yup.string().when("auth_strategy", {
      is: "header",
      then: (schema) => schema.required(t`Header name is required`),
    }),
    header_value: Yup.string().when("auth_strategy", {
      is: "header",
      then: (schema) =>
        isEditing ? schema : schema.required(t`Header value is required`),
    }),
  });

type Props =
  | { mode: "create"; preset: McpServerPreset; onClose: () => void }
  | { mode: "edit"; server: McpServer; onClose: () => void };

export function McpServerModal(props: Props) {
  const { onClose } = props;
  const [createServer] = useCreateMcpServerMutation();
  const [updateServer] = useUpdateMcpServerMutation();
  const isEditing = props.mode === "edit";

  const initialValues: FormValues =
    props.mode === "create"
      ? {
          name: props.preset.name,
          url: props.preset.url,
          auth_strategy: props.preset.auth_strategy,
          header_name: "Authorization",
          header_value: "",
        }
      : {
          name: props.server.name,
          url: props.server.url,
          auth_strategy: props.server.auth_strategy,
          header_name: "Authorization",
          header_value: "",
        };

  const handleSubmit = useCallback(
    async (values: FormValues) => {
      const credentials =
        values.auth_strategy === "header"
          ? {
              header_name: values.header_name,
              header_value: values.header_value || null,
            }
          : {};
      if (props.mode === "create") {
        const body: CreateMcpServerRequest = {
          name: values.name,
          url: values.url,
          provider: props.preset.provider,
          auth_strategy: values.auth_strategy,
          ...credentials,
        };
        await createServer(body).unwrap();
      } else {
        await updateServer({
          id: props.server.id,
          name: values.name,
          url: values.url,
          auth_strategy: values.auth_strategy,
          ...credentials,
        }).unwrap();
      }
      onClose();
    },
    [props, createServer, updateServer, onClose],
  );

  return (
    <Modal
      size="40rem"
      padding="xxl"
      opened
      onClose={onClose}
      title={isEditing ? t`Edit MCP server` : t`Add MCP server`}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={getValidationSchema(isEditing)}
        onSubmit={handleSubmit}
      >
        {({ values }) => (
          <Form>
            <Stack gap="xl">
              <FormTextInput
                name="name"
                label={t`Name`}
                placeholder={t`What people will see this server called`}
                required
                maxLength={250}
              />
              <FormTextInput
                name="url"
                label={t`Server URL`}
                placeholder="https://example.com/mcp"
                description={t`The Streamable HTTP endpoint of the MCP server.`}
                required
              />
              <FormSelect
                name="auth_strategy"
                label={t`Authentication`}
                data={getAuthStrategyOptions()}
              />
              {values.auth_strategy === "header" && (
                <>
                  <FormTextInput
                    name="header_name"
                    label={t`Header name`}
                    placeholder="Authorization"
                    required
                  />
                  <FormTextInput
                    name="header_value"
                    type="password"
                    label={t`Header value`}
                    placeholder="Bearer …"
                    description={
                      isEditing
                        ? t`Leave blank to keep the current value. Everyone who connects will use this credential.`
                        : t`Everyone who connects will use this credential.`
                    }
                    required={!isEditing}
                  />
                </>
              )}
              {values.auth_strategy === "oauth" && (
                <Text c="text-secondary" fz="sm">
                  {t`Each person will be sent to the service to sign in and approve access for themselves.`}
                </Text>
              )}
              <FormErrorMessage />
              <Group justify="flex-end">
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  variant="filled"
                  label={isEditing ? t`Save` : t`Add server`}
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}
