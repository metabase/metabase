import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon } from "metabase/ui";

import { NewInstanceModal } from "../NewInstanceModal";

export function AddInstanceButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        leftSection={<FixedSizeIcon name="add" aria-hidden />}
        onClick={open}
      >
        {t`Add instance`}
      </Button>
      <NewInstanceModal opened={opened} onCreate={close} onClose={close} />
    </>
  );
}
