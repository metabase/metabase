import { t } from "ttag";
import * as Yup from "yup";

import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import {
  Button,
  FocusTrap,
  Group,
  Modal,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useSetupWorkspaceDeploymentMutation } from "metabase-enterprise/api";
import type {
  Workspace,
  WorkspaceInstance,
  WorkspaceInstanceId,
} from "metabase-types/api";

export type SetupInstanceModalProps = {
  workspace: Workspace;
  instances: WorkspaceInstance[];
  opened: boolean;
  onClose: () => void;
};

export function SetupInstanceModal({
  workspace,
  instances,
  opened,
  onClose,
}: SetupInstanceModalProps) {
  return (
    <Modal
      title={t`Set up a development instance`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <SetupInstanceForm
        workspace={workspace}
        instances={instances}
        onClose={onClose}
      />
    </Modal>
  );
}

type SetupInstanceFormValues = {
  instance_id: WorkspaceInstanceId | null;
};

const SETUP_INSTANCE_SCHEMA = Yup.object({
  instance_id: Yup.number().nullable().required(Errors.required),
});

const INITIAL_VALUES: SetupInstanceFormValues = {
  instance_id: null,
};

type SetupInstanceFormProps = {
  workspace: Workspace;
  instances: WorkspaceInstance[];
  onClose: () => void;
};

function SetupInstanceForm({
  workspace,
  instances,
  onClose,
}: SetupInstanceFormProps) {
  const [setupWorkspaceDeployment] = useSetupWorkspaceDeploymentMutation();

  const data = instances.map((instance) => ({
    value: String(instance.id),
    label: instance.name,
    // An instance already backing another workspace can't be reused.
    disabled: instance.workspace_id != null,
  }));

  const handleSubmit = async ({ instance_id }: SetupInstanceFormValues) => {
    if (instance_id == null) {
      return;
    }
    await setupWorkspaceDeployment({
      id: workspace.id,
      instance_id,
    }).unwrap();
    onClose();
  };

  return (
    <FormProvider
      initialValues={INITIAL_VALUES}
      validationSchema={SETUP_INSTANCE_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ values, setFieldValue }) => (
        <Form>
          <Stack gap="lg">
            <Text>
              {t`Pick a registered development instance to back with this workspace's data. Instances already in use by another workspace aren't available.`}
            </Text>
            <Select
              label={t`Development instance`}
              data={data}
              value={
                values.instance_id != null ? String(values.instance_id) : null
              }
              onChange={(value) =>
                setFieldValue(
                  "instance_id",
                  value != null ? Number(value) : null,
                )
              }
            />
            <FormErrorMessage />
            <Group justify="flex-end">
              <Button onClick={onClose}>{t`Cancel`}</Button>
              <FormSubmitButton label={t`Set up`} variant="filled" />
            </Group>
          </Stack>
        </Form>
      )}
    </FormProvider>
  );
}
