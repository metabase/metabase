import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { Button, FixedSizeIcon } from "metabase/ui";

import { NewInstanceModal } from "../NewInstanceModal";

export function NewInstanceButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button
        leftSection={<FixedSizeIcon name="add" aria-hidden />}
        onClick={open}
      >
        {t`New`}
      </Button>
      <NewInstanceModal opened={opened} onCreate={close} onClose={close} />
    </>
  );
}
