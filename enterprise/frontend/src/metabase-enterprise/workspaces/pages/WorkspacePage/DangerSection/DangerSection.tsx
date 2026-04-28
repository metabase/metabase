import { push } from "react-router-redux";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Button, Flex, Tooltip } from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { isDatabaseUnprovisioned } from "../../../utils";
import { TitleSection } from "../TitleSection";

type DangerSectionProps = {
  workspace: Workspace;
};

export function DangerSection({ workspace }: DangerSectionProps) {
  const dispatch = useDispatch();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { modalContent, show } = useConfirmation();

  const isFullyUnprovisioned = workspace.databases.every(
    isDatabaseUnprovisioned,
  );

  const handleDelete = () => {
    show({
      title: t`Delete this workspace?`,
      message: t`This cannot be undone.`,
      confirmButtonText: t`Delete workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await deleteWorkspace(workspace.id);
        if (error) {
          sendErrorToast(t`Failed to delete workspace`);
          return;
        }
        sendSuccessToast(t`Workspace deleted`);
        dispatch(push(Urls.workspaceList()));
      },
    });
  };

  return (
    <TitleSection
      label={t`Danger zone`}
      description={t`Deleting a workspace removes its database access mappings. The workspace must be unprovisioned first.`}
    >
      <Flex p="md" justify="flex-end">
        <Tooltip
          label={t`Unprovision the workspace before deleting it.`}
          disabled={isFullyUnprovisioned}
          openDelay={TOOLTIP_OPEN_DELAY}
        >
          <Button
            variant="filled"
            color="error"
            disabled={!isFullyUnprovisioned}
            onClick={handleDelete}
          >{t`Delete workspace`}</Button>
        </Tooltip>
      </Flex>
      {modalContent}
    </TitleSection>
  );
}
