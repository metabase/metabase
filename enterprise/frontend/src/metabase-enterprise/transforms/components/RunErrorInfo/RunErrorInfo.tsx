import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
import type { MouseEvent } from "react";
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
  message: string;
  endTime: Date | null;
};

export function RunErrorInfo({ message, endTime }: RunErrorInfoProps) {
  const [isOpened, { open, close }] = useDisclosure();

  const handleIconClick = (event: MouseEvent) => {
    // prevent the outer element from being clicked when the icon is clicked
    event.stopPropagation();
    open();
  };

  const handleModalClick = (event: MouseEvent) => {
    // prevent the outer element from being clicked on any click in the modal
    event.stopPropagation();
  };

  return (
    <>
      <Tooltip label={t`See error`}>
        <ActionIcon aria-label={t`See error`} onClick={handleIconClick}>
          <Icon name="document" />
        </ActionIcon>
      </Tooltip>
      {isOpened && (
        <Modal
          title={getTitle(endTime)}
          size="xl"
          padding="xl"
          opened
          onClick={handleModalClick}
          onClose={close}
        >
          <FocusTrap.InitialFocus />
          <RunErrorModalContent message={message} onClose={close} />
        </Modal>
      )}
    </>
  );
}

function getTitle(endTime: Date | null) {
  return endTime
    ? t`Failed at ${dayjs(endTime).format("lll")}, with this error`
    : t`Failed with this error`;
}

type RunErrorModalContentProps = {
  message: string;
  onClose: () => void;
};

function RunErrorModalContent({ message, onClose }: RunErrorModalContentProps) {
  return (
    <Stack pt="md" gap="lg">
      <Box className={S.codeContainer} pos="relative" pr="lg">
        <CodeEditor value={message} readOnly />
        <Box p="sm" pos="absolute" right={0} top={0}>
          <CopyButton value={message} />
        </Box>
      </Box>
      <Group justify="end">
        <Button onClick={onClose}>{t`Close`}</Button>
      </Group>
    </Stack>
  );
}
