import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { Button, FixedSizeIcon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { NewWorkspaceModal } from "../NewWorkspaceModal";

export function NewWorkspaceButton() {
  const [opened, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();

  const handleCreate = (workspace: Workspace) => {
    close();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <>
      <Button
        leftSection={<FixedSizeIcon name="add" aria-hidden />}
        onClick={open}
      >
        {t`New`}
      </Button>
      <NewWorkspaceModal
        opened={opened}
        onCreate={handleCreate}
        onClose={close}
      />
    </>
  );
}
