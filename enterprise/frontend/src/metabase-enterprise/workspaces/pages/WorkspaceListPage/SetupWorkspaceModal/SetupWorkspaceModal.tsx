import { push } from "react-router-redux";
import { jt, t } from "ttag";

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
  FocusTrap,
  Group,
  Modal,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import { useApplyAdvancedConfigMutation } from "metabase-enterprise/api";

import { trackWorkspaceInstanceSetup } from "../../../analytics";

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
      title={t`Set up a workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <SetupWorkspaceForm onClose={onClose} />
    </Modal>
  );
}

type SetupWorkspaceFormValues = {
  config: File | null;
};

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
    trackWorkspaceInstanceSetup();
    onClose();
    dispatch(push(Urls.workspaces()));
  };

  return (
    <FormProvider initialValues={INITIAL_VALUES} onSubmit={handleSubmit}>
      {({ values }) => (
        <Form>
          <Stack gap="lg">
            <Text c="text-secondary">
              {jt`Upload the ${(
                <Code key="config">{CONFIG_FILENAME}</Code>
              )} you downloaded from a workspace on your production instance.`}
            </Text>
            <FormFileInput
              name="config"
              label={t`Config file`}
              placeholder={t`Choose a ${CONFIG_FILENAME} file`}
              accept=".yml,.yaml,application/yaml,text/yaml"
              leftSection={<FixedSizeIcon name="attachment" aria-hidden />}
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton
                label={t`Set up`}
                variant="filled"
                disabled={values.config == null}
              />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}
