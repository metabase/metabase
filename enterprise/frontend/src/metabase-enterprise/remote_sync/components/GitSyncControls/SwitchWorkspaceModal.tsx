import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useUpdateUserMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useToast } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
} from "metabase/forms";
import { useSelector } from "metabase/redux";
import { getUser } from "metabase/selectors/user";
import { Button, Group, Modal, Stack } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type SwitchWorkspaceModalProps = {
  opened: boolean;
  onClose: () => void;
  currentWorkspaceId: number | null | undefined;
};

export function SwitchWorkspaceModal({
  opened,
  onClose,
  currentWorkspaceId,
}: SwitchWorkspaceModalProps) {
  return (
    <Modal
      size="30rem"
      padding="xl"
      opened={opened}
      onClose={onClose}
      title={t`Switch workspace`}
    >
      <SwitchWorkspaceFormLoader
        onClose={onClose}
        currentWorkspaceId={currentWorkspaceId}
      />
    </Modal>
  );
}

type SwitchWorkspaceFormLoaderProps = {
  onClose: () => void;
  currentWorkspaceId: number | null | undefined;
};

function SwitchWorkspaceFormLoader({
  onClose,
  currentWorkspaceId,
}: SwitchWorkspaceFormLoaderProps) {
  const { data: workspaces = [], isLoading, error } = useListWorkspacesQuery();

  if (isLoading || error) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <SwitchWorkspaceForm
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      onClose={onClose}
    />
  );
}

type SwitchWorkspaceFormValues = {
  workspaceId: string | null;
};

const VALIDATION_SCHEMA = Yup.object({
  workspaceId: Yup.string().nullable().required(Errors.required),
});

type SwitchWorkspaceFormProps = {
  workspaces: Workspace[];
  currentWorkspaceId: number | null | undefined;
  onClose: () => void;
};

function SwitchWorkspaceForm({
  workspaces,
  currentWorkspaceId,
  onClose,
}: SwitchWorkspaceFormProps) {
  const currentUser = useSelector(getUser);
  const [updateUser] = useUpdateUserMutation();
  const [sendToast] = useToast();

  const options = useMemo(
    () =>
      workspaces.map((workspace) => ({
        value: String(workspace.id),
        label: workspace.branch,
      })),
    [workspaces],
  );

  const initialValues: SwitchWorkspaceFormValues = {
    workspaceId: currentWorkspaceId != null ? String(currentWorkspaceId) : null,
  };

  const handleSubmit = async ({ workspaceId }: SwitchWorkspaceFormValues) => {
    if (!currentUser || !workspaceId) {
      return;
    }
    try {
      await updateUser({
        id: currentUser.id,
        workspace_id: Number(workspaceId),
      }).unwrap();
      onClose();
    } catch (err) {
      sendToast({
        icon: "warning",
        message: getErrorMessage(err, t`Failed to switch workspace`),
      });
    }
  };

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={VALIDATION_SCHEMA}
      onSubmit={handleSubmit}
    >
      <Form>
        <Stack gap="xl">
          <FormSelect
            name="workspaceId"
            label={t`Workspace`}
            placeholder={t`Select a workspace`}
            data={options}
            searchable
            required
          />
          <FormErrorMessage />
          <Group justify="flex-end">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton variant="filled" label={t`Switch`} />
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}
