import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { Box, Button } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { NewWorkspaceModal } from "../NewWorkspaceModal";

export function WorkspaceListEmptyState() {
  const [opened, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();

  const handleCreate = (workspace: Workspace) => {
    close();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <>
      <WorkspaceEmptyState
        description={t`Develop transforms and the semantic layer without touching production tables. Each workspace gets its own schema and database user in the warehouses you pick.`}
      >
        <Box pb="xl">
          <Button variant="filled" onClick={open}>
            {t`Create a workspace`}
          </Button>
        </Box>
      </WorkspaceEmptyState>
      <NewWorkspaceModal
        opened={opened}
        onCreate={handleCreate}
        onClose={close}
      />
    </>
  );
}
