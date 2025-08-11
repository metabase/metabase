import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import {
  ActionIcon,
  Box,
  Button,
  FocusTrap,
  Group,
  Icon,
  Modal,
  Stack,
  Tooltip,
} from "metabase/ui";

import S from "./RunErrorInfo.module.css";

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
        <Modal title={title} size="xl" padding="xl" opened onClose={close}>
          <FocusTrap.InitialFocus />
          <RunErrorModalContent error={error} onClose={close} />
        </Modal>
      )}
    </>
  );
}

type RunErrorModalContentProps = {
  error: string;
  onClose: () => void;
};

function RunErrorModalContent({ error, onClose }: RunErrorModalContentProps) {
  return (
    <Stack>
      <Box className={S.codeContainer} pos="relative" pr="lg">
        <CodeEditor value={error} readOnly />
        <Box p="sm" pos="absolute" right={0} top={0}>
          <CopyButton value={error} />
        </Box>
      </Box>
      <Group justify="end">
        <Button onClick={onClose}>{t`Close`}</Button>
      </Group>
    </Stack>
  );
}
