import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon } from "metabase/ui";

import { NewWorkspaceModal } from "../NewWorkspaceModal";

export function NewWorkspaceButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        leftSection={<FixedSizeIcon name="add" aria-hidden />}
        onClick={open}
      >
        {t`New`}
      </Button>
      <NewWorkspaceModal opened={opened} onCreate={close} onClose={close} />
    </>
  );
}
