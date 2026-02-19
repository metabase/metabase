import { useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import { Box, Button, Group, Modal, Progress, Stack, Text } from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api/dependencies";
import {
  useGetReplaceSourceRunQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api/replacement";
import type {
  ReplaceSourceEntry,
  ReplaceSourceRun,
  ReplaceSourceRunId,
} from "metabase-types/api";

import { DEPENDENT_TYPES } from "../constants";

const POLLING_INTERVAL = 1000;

type ConfirmModalProps = {
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  isOpened: boolean;
  onDone: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  source,
  target,
  isOpened,
  onDone,
  onClose,
}: ConfirmModalProps) {
  const [runId, setRunId] = useState<ReplaceSourceRunId>();
  const { data: nodes = [] } = useListNodeDependentsQuery({
    id: source.id,
    type: source.type,
    dependent_types: DEPENDENT_TYPES,
  });
  const [sendToast] = useToast();

  const itemsCount = nodes.length;
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
      opened={isOpened}
      onClose={onClose}
    >
      {runId == null ? (
        <ConfirmModalContent
          source={source}
          target={target}
          itemsCount={nodes.length}
          isDisabled={runId != null}
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
  isDisabled: boolean;
  onSubmit: (runId: ReplaceSourceRunId) => void;
  onCancel: () => void;
};

function ConfirmModalContent({
  source,
  target,
  itemsCount,
  isDisabled,
  onSubmit,
  onCancel,
}: ConfirmModalContentProps) {
  const [replaceSource] = useReplaceSourceMutation();

  const handleSubmit = async () => {
    const action = replaceSource({
      source_entity_id: source.id,
      source_entity_type: source.type,
      target_entity_id: target.id,
      target_entity_type: target.type,
    });
    const response = await action.unwrap();
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
            <Button type="submit" disabled={isDisabled}>
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

  useEffect(() => {
    if (run != null && run.status !== "started") {
      onDone(run);
    }
  }, [run, onDone]);

  return (
    <Stack gap="sm">
      <Text c="text-secondary">{getProgressLabel(startTime)}</Text>
      <Progress value={getProgressValue(run)} />
    </Stack>
  );
}

function getTitle(itemsCount: number, isStarted: boolean) {
  if (isStarted) {
    return t`Replacing data sources…`;
  }
  return ngettext(
    msgid`Really replace the data source in ${itemsCount} item?`,
    `Really replace the data sources in ${itemsCount} items?`,
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

function getProgressLabel(startTime: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);

  return ngettext(
    msgid`It's been ${seconds} second so far`,
    `It's been ${seconds} seconds so far`,
    seconds,
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
