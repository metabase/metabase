import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { Button, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Workspace } from "metabase-types/api";

import { NewWorkspaceModal } from "../NewWorkspaceModal";

export type NewWorkspaceButtonProps = {
  variant?: "default" | "filled";
};

export function NewWorkspaceButton({
  variant = "default",
}: NewWorkspaceButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();

  const handleCreate = (workspace: Workspace) => {
    close();
    dispatch(push(Urls.workspace(workspace.id)));
  };

  return (
    <>
      {variant === "filled" ? (
        <Button variant="filled" onClick={open}>
          {t`Create a workspace`}
        </Button>
      ) : (
        <Button leftSection={<Icon name="add" />} onClick={open}>
          {t`Add`}
        </Button>
      )}
      <NewWorkspaceModal
        opened={opened}
        onCreate={handleCreate}
        onClose={close}
      />
    </>
  );
}
