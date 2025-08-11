import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Code, FocusTrap, Icon, Modal, Tooltip } from "metabase/ui";

type RunErrorInfoProps = {
  title: string;
  error: string;
};

export function RunErrorInfo({ title, error }: RunErrorInfoProps) {
  const [isOpened, { open, close }] = useDisclosure();

  return (
    <>
      <Tooltip label={t`See error`}>
        <ActionIcon onClick={open}>
          <Icon name="document" />
        </ActionIcon>
      </Tooltip>
      {isOpened && (
        <Modal title={title} opened padding="xl" onClose={close}>
          <FocusTrap.InitialFocus />
          <Code>{error}</Code>
        </Modal>
      )}
    </>
  );
}
