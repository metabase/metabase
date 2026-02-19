import { useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import {
  useGetReplaceSourceRunQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api/replacement";
import type {
  ReplaceSourceEntry,
  ReplaceSourceRun,
  ReplaceSourceRunId,
} from "metabase-types/api";

const POLLING_INTERVAL = 1000;

type ReplaceModalProps = {
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  itemsCount: number;
  opened: boolean;
  onDone: () => void;
  onClose: () => void;
};

export function ReplaceModal({
  source,
  target,
  itemsCount,
  opened,
  onDone,
  onClose,
}: ReplaceModalProps) {
  const [runId, setRunId] = useState<ReplaceSourceRunId>();
  const [sendToast] = useToast();

  const isStarted = runId != null;

  const handleDone = (run: ReplaceSourceRun) => {
    if (run.status === "succeeded") {
      sendToast({
        message: getSuccessMessage(itemsCount),
        icon: "check",
      });
    } else {
      sendToast({
        message: getErrorMessage(),
        icon: "warning",
      });
    }
    onDone();
  };

  return (
    <Modal
      title={getTitle(itemsCount, isStarted)}
      opened={opened}
      onClose={onClose}
    >
      {runId == null ? (
        <ConfirmModalContent
          source={source}
          target={target}
          itemsCount={itemsCount}
          disabled={runId != null}
          onSubmit={setRunId}
          onCancel={onClose}
        />
      ) : (
        <ProgressModalContent runId={runId} onDone={handleDone} />
      )}
    </Modal>
  );
}

type ConfirmModalContentProps = {
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  itemsCount: number;
  disabled: boolean;
  onSubmit: (runId: ReplaceSourceRunId) => void;
  onCancel: () => void;
};

function ConfirmModalContent({
  source,
  target,
  itemsCount,
  disabled,
  onSubmit,
  onCancel,
}: ConfirmModalContentProps) {
  const [replaceSource] = useReplaceSourceMutation();

  const handleSubmit = async () => {
    const response = await replaceSource({
      source_entity_id: source.id,
      source_entity_type: source.type,
      target_entity_id: target.id,
      target_entity_type: target.type,
    }).unwrap();
    onSubmit(response.run_id);
  };

  return (
    <FormProvider initialValues={{}} onSubmit={handleSubmit}>
      <Form>
        <Stack>
          <Text>{t`This can't be undone.`}</Text>
          <Group>
            <Box flex={1}>
              <FormErrorMessage />
            </Box>
            <Button onClick={onCancel}>{t`Go back`}</Button>
            <Button
              type="submit"
              variant="filled"
              color="error"
              disabled={disabled}
            >
              {getSubmitLabel(itemsCount)}
            </Button>
          </Group>
        </Stack>
      </Form>
    </FormProvider>
  );
}

type ProgressModalContentProps = {
  runId: ReplaceSourceRunId;
  onDone: (run: ReplaceSourceRun) => void;
};

function ProgressModalContent({ runId, onDone }: ProgressModalContentProps) {
  const { data: run } = useGetReplaceSourceRunQuery(runId, {
    pollingInterval: POLLING_INTERVAL,
  });
  const [startTime] = useState(() => new Date());
  const [currentTime, setCurrentTime] = useState(startTime);
  const elapsedSeconds = getElapsedSeconds(startTime, currentTime);

  useEffect(() => {
    if (run != null && run.status !== "started") {
      onDone(run);
    }
  }, [run, onDone]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, POLLING_INTERVAL);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Stack gap="sm">
      <Text c="text-secondary">{getProgressLabel(elapsedSeconds)}</Text>
      <Progress value={getProgressValue(run)} />
    </Stack>
  );
}

function getTitle(itemsCount: number, isStarted: boolean) {
  if (isStarted) {
    return t`Replacing data sources…`;
  }
  return ngettext(
    msgid`Really replace the data source in this ${itemsCount} item?`,
    `Really replace the data sources in these ${itemsCount} items?`,
    itemsCount,
  );
}

function getSubmitLabel(itemsCount: number): string {
  return ngettext(
    msgid`Replace data source in ${itemsCount} item`,
    `Replace data source in ${itemsCount} items`,
    itemsCount,
  );
}

function getProgressValue(run: ReplaceSourceRun | undefined): number {
  if (run == null) {
    return 0;
  }
  return run.progress * 100;
}

function getElapsedSeconds(startTime: Date, currentTime: Date): number {
  return Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);
}

function getProgressLabel(elapsedSeconds: number): string {
  return ngettext(
    msgid`It's been ${elapsedSeconds} second so far`,
    `It's been ${elapsedSeconds} seconds so far`,
    elapsedSeconds,
  );
}

function getSuccessMessage(itemsCount: number): string {
  return ngettext(
    msgid`Updated ${itemsCount} item`,
    `Updated ${itemsCount} items`,
    itemsCount,
  );
}

function getErrorMessage(): string {
  return t`Failed to replace a data source`;
}
