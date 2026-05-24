import { push } from "react-router-redux";
import { jt, t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormFileInput,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useDispatch } from "metabase/redux";
import {
  Button,
  Code,
  FixedSizeIcon,
  Group,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Errors from "metabase/utils/errors";
import { useApplyAdvancedConfigMutation } from "metabase-enterprise/api";

const CONFIG_FILENAME = "config.yml";

type SetupWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function SetupWorkspaceModal({
  opened,
  onClose,
}: SetupWorkspaceModalProps) {
  return (
    <Modal
      title={t`Set up a developer instance`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <SetupWorkspaceForm onClose={onClose} />
    </Modal>
  );
}

type SetupWorkspaceFormValues = {
  config: File | null;
};

const SETUP_WORKSPACE_SCHEMA = Yup.object({
  config: Yup.mixed<File>().nullable().required(Errors.required),
});

const INITIAL_VALUES: SetupWorkspaceFormValues = {
  config: null,
};

type SetupWorkspaceFormProps = {
  onClose: () => void;
};

function SetupWorkspaceForm({ onClose }: SetupWorkspaceFormProps) {
  const dispatch = useDispatch();
  const [applyConfig] = useApplyAdvancedConfigMutation();

  const handleSubmit = async ({ config }: SetupWorkspaceFormValues) => {
    if (!config) {
      return;
    }
    await applyConfig({ config }).unwrap();
    onClose();
    dispatch(push(Urls.workspaceInstance()));
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={SETUP_WORKSPACE_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="lg">
          <Text c="text-secondary">
            {jt`Upload the ${(
              <Code key="config">{CONFIG_FILENAME}</Code>
            )} from the main instance's workspace page.`}
          </Text>
          <FormFileInput
            name="config"
            label={t`Config file`}
            placeholder={t`Choose a ${CONFIG_FILENAME} file`}
            accept=".yml,.yaml,application/yaml,text/yaml"
            leftSection={<FixedSizeIcon name="attachment" aria-hidden />}
            data-autofocus
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton label={t`Set up`} variant="filled" />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
