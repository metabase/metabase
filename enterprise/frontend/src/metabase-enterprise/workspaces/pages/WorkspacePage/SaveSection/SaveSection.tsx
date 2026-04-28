import { push } from "react-router-redux";
import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Button, Group } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";

import type { WorkspaceInfo } from "../../../types";

type SaveSectionProps = {
  workspace: WorkspaceInfo;
};

export function SaveSection({ workspace }: SaveSectionProps) {
  const dispatch = useDispatch();
  const [createWorkspace, { isLoading }] = useCreateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();

  const isValid =
    workspace.name.trim().length > 0 && workspace.databases.length > 0;

  const handleSave = async () => {
    const { data, error } = await createWorkspace({
      name: workspace.name,
      databases: workspace.databases,
    });
    if (error || data == null) {
      sendErrorToast(t`Failed to create workspace`);
      return;
    }
    dispatch(push(Urls.adminWorkspace(data.id)));
  };

  return (
    <Group justify="flex-end">
      <Button
        variant="filled"
        loading={isLoading}
        disabled={!isValid}
        onClick={handleSave}
      >{t`Save`}</Button>
    </Group>
  );
}
