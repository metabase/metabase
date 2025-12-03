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
import type { TransformRunStatus } from "metabase-types/api";

import S from "./RunInfo.module.css";

type RunInfoProps = {
  status: TransformRunStatus;
  message: string;
  endTime: Date | null;
};

export function RunInfo({ status, message, endTime }: RunInfoProps) {
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

  if (!message || (status !== "failed" && status !== "succeeded")) {
    return null;
  }

  return (
    <>
      <Tooltip label={getTooltip(status)}>
        <ActionIcon aria-label={t`See error`} onClick={handleIconClick}>
          <Icon name="document" />
        </ActionIcon>
      </Tooltip>
      {isOpened && (
        <Modal
          title={getTitle(status, endTime)}
          size="xl"
          padding="xl"
          opened
          onClick={handleModalClick}
          onClose={close}
        >
          <FocusTrap.InitialFocus />
          <RunInfoModalContent message={message} onClose={close} />
        </Modal>
      )}
    </>
  );
}

function getTooltip(status: TransformRunStatus) {
  if (status === "failed") {
    return t`See error`;
  }
  if (status === "succeeded") {
    return t`See logs`;
  }
}

function getTitle(status: TransformRunStatus, endTime: Date | null) {
  if (status === "failed") {
    return endTime
      ? t`Failed at ${dayjs(endTime).format("lll")}, with this error`
      : t`Failed with this error`;
  }
  if (status === "succeeded") {
    return endTime
      ? t`Succeeded at ${dayjs(endTime).format("lll")}, with the following logs`
      : t`Succeeded with the following logs`;
  }
  return null;
}

type RunErrorModalContentProps = {
  message: string;
  onClose: () => void;
};

function RunInfoModalContent({ message, onClose }: RunErrorModalContentProps) {
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
