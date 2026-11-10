import { useMemo, useState } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import {
  useCreateActionSecretMutation,
  useListActionSecretsQuery,
  useListActionTemplateCategoriesQuery,
} from "metabase/api";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { useNavigate } from "metabase/router";
import { Button, Modal, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import type {
  ActionSecretTemplate,
  ActionTemplate,
  ActionTemplateCategory,
} from "metabase-types/api";

import {
  type TemplatePickerCategory,
  TemplatePickerModal,
} from "../TemplatePickerModal";

type MissingSecrets = {
  template: ActionTemplate;
  secrets: ActionSecretTemplate[];
};

type ActionTemplateModalProps = {
  onClose: () => void;
};

export function ActionTemplateModal({ onClose }: ActionTemplateModalProps) {
  const {
    data: categories = [],
    isLoading: isLoadingCategories,
    error: categoriesError,
  } = useListActionTemplateCategoriesQuery();
  const {
    data: secrets = [],
    isLoading: isLoadingSecrets,
    error: secretsError,
  } = useListActionSecretsQuery();
  const [missingSecrets, setMissingSecrets] = useState<MissingSecrets>();
  const navigate = useNavigate();
  const isLoading = isLoadingCategories || isLoadingSecrets;
  const error = categoriesError ?? secretsError;

  const pickerCategories = useMemo(
    () => getPickerCategories(categories),
    [categories],
  );

  const openTemplate = (template: ActionTemplate) => {
    navigate(Urls.newDataStudioActionFromTemplate(template.id));
  };

  const handleSelect = (templateId: string) => {
    const category = categories.find(({ actions }) =>
      actions.some(({ id }) => id === templateId),
    );
    const template = category?.actions.find(({ id }) => id === templateId);
    if (category == null || template == null) {
      return;
    }
    const secretNames = new Set(secrets.map(({ name }) => name));
    const missing = category.secrets.filter(
      ({ id, secret_name }) =>
        template.required_secrets.includes(id) && !secretNames.has(secret_name),
    );
    if (missing.length === 0) {
      openTemplate(template);
    } else {
      setMissingSecrets({ template, secrets: missing });
    }
  };

  if (missingSecrets != null) {
    return (
      <Modal title={t`Add secrets`} opened onClose={onClose}>
        <RequiredSecretsForm
          template={missingSecrets.template}
          secrets={missingSecrets.secrets}
          onBack={() => setMissingSecrets(undefined)}
          onDone={() => openTemplate(missingSecrets.template)}
        />
      </Modal>
    );
  }

  return (
    <TemplatePickerModal
      title={t`New action from a template`}
      categories={pickerCategories}
      isLoading={isLoading}
      error={error}
      onSelect={handleSelect}
      onClose={onClose}
    />
  );
}

function getPickerCategories(
  categories: ActionTemplateCategory[],
): TemplatePickerCategory[] {
  return categories
    .filter(({ actions }) => actions.length > 0)
    .map(({ id, name, actions }) => ({ id, name, items: actions }));
}

type RequiredSecretsFormProps = {
  template: ActionTemplate;
  secrets: ActionSecretTemplate[];
  onBack: () => void;
  onDone: () => void;
};

function RequiredSecretsForm({
  template,
  secrets,
  onBack,
  onDone,
}: RequiredSecretsFormProps) {
  const [createSecret] = useCreateActionSecretMutation();
  const validationSchema = useMemo(
    () =>
      Yup.object(
        Object.fromEntries(
          secrets.map(({ id }) => [id, Yup.string().required(Errors.required)]),
        ),
      ),
    [secrets],
  );
  const initialValues: Record<string, string> = Object.fromEntries(
    secrets.map(({ id }) => [id, ""]),
  );

  const handleSubmit = async (values: Record<string, string>) => {
    await Promise.all(
      secrets.map((secret) =>
        createSecret({
          name: secret.secret_name,
          value: values[secret.id] ?? "",
          allowed_hosts: secret.allowed_hosts,
        }).unwrap(),
      ),
    );
    onDone();
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={validationSchema}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg" mt="sm">
          <Text>
            {t`${template.name} needs these secrets. They are sent only to their allowed hosts.`}
          </Text>
          {secrets.map((secret) => (
            <FormTextarea
              key={secret.id}
              name={secret.id}
              label={secret.name}
              description={secret.description}
              minRows={2}
            />
          ))}
        </Stack>
        <Modal.Footer>
          <FormErrorMessage flex={1} />
          <Button onClick={onBack}>{t`Back`}</Button>
          <FormSubmitButton
            label={t`Create secrets and continue`}
            variant="filled"
          />
        </Modal.Footer>
      </Form>
    </FormProvider>
  );
}
