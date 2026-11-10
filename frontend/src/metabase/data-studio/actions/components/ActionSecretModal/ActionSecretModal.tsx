import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  useCreateActionSecretMutation,
  useUpdateActionSecretMutation,
} from "metabase/api";
import { useMetadataToasts } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { ActionSecret } from "metabase-types/api";

import {
  ACTION_NAME_MAX_LENGTH,
  ACTION_SECRET_NAME_REGEX,
} from "../../constants";

function getAllowedHosts(text: string): string[] {
  return text
    .split("\n")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

const getValidationSchema = (isNew: boolean) =>
  Yup.object({
    name: Yup.string()
      .required(Errors.required)
      .max(ACTION_NAME_MAX_LENGTH, Errors.maxLength)
      .matches(
        ACTION_SECRET_NAME_REGEX,
        () => t`Use letters, digits and underscores.`,
      ),
    value: isNew
      ? Yup.string().required(Errors.required)
      : Yup.string().default(""),
    allowed_hosts: Yup.string()
      .defined()
      .test(
        "has-host",
        () => t`Add at least one host.`,
        (value) => value != null && getAllowedHosts(value).length > 0,
      ),
  });

type ActionSecretValues = Yup.InferType<ReturnType<typeof getValidationSchema>>;

type ActionSecretModalProps = {
  secret?: ActionSecret;
  onClose: () => void;
};

export function ActionSecretModal({ secret, onClose }: ActionSecretModalProps) {
  const [createSecret] = useCreateActionSecretMutation();
  const [updateSecret] = useUpdateActionSecretMutation();
  const { sendSuccessToast } = useMetadataToasts();
  const isNew = secret == null;
  const validationSchema = useMemo(() => getValidationSchema(isNew), [isNew]);
  const initialValues: ActionSecretValues = {
    name: secret?.name ?? "",
    value: "",
    allowed_hosts: secret?.allowed_hosts.join("\n") ?? "",
  };

  const handleSubmit = async ({
    name,
    value,
    allowed_hosts,
  }: ActionSecretValues) => {
    const allowedHosts = getAllowedHosts(allowed_hosts);
    if (secret == null) {
      await createSecret({ name, value, allowed_hosts: allowedHosts }).unwrap();
      sendSuccessToast(t`Secret created`);
    } else {
      await updateSecret({
        id: secret.id,
        name,
        allowed_hosts: allowedHosts,
        ...(value.length > 0 ? { value } : {}),
      }).unwrap();
      sendSuccessToast(t`Secret updated`);
    }
    onClose();
  };

  return (
    <Modal
      title={isNew ? t`New secret` : t`Edit secret`}
      opened
      onClose={onClose}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack gap="lg" mt="sm">
            <FormTextInput
              name="name"
              label={t`Name`}
              description={
                isNew
                  ? t`Use it in a request as {{secrets.name}}.`
                  : t`Renaming breaks requests that use the old name.`
              }
              data-autofocus
            />
            <FormTextarea
              name="value"
              label={t`Value`}
              description={
                isNew
                  ? t`Saved as is. Nobody can see it again, not even you.`
                  : t`The current value can't be shown. Type a new one to replace it.`
              }
              placeholder={
                isNew ? undefined : t`Leave empty to keep the current value`
              }
              minRows={3}
            />
            <FormTextarea
              name="allowed_hosts"
              label={t`Allowed hosts`}
              description={t`One host per line. The secret is only sent to these hosts.`}
              minRows={3}
            />
          </Stack>
          <Modal.Footer>
            <FormErrorMessage flex={1} />
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Save`} variant="filled" />
          </Modal.Footer>
        </Form>
      </FormProvider>
    </Modal>
  );
}
