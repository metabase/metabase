import { useEffect, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Form, FormErrorMessage, FormProvider } from "metabase/forms";
import {
  Box,
  Button,
  Group,
  type IconName,
  Modal,
  Progress,
  Stack,
  Text,
} from "metabase/ui";
import { useListNodeDependentsQuery } from "metabase-enterprise/api/dependencies";
import {
  useGetReplaceSourceRunQuery,
  useReplaceSourceMutation,
} from "metabase-enterprise/api/replacement";
import type {
  DependencyNode,
  ReplaceSourceEntry,
  ReplaceSourceRun,
  ReplaceSourceRunId,
} from "metabase-types/api";

import { DEPENDENT_TYPES } from "../constants";

type ReplaceModalProps = {
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  isOpened: boolean;
  onFinished: () => void;
  onClose: () => void;
};

export function ReplaceModal({
  source,
  target,
  isOpened,
  onFinished,
  onClose,
}: ReplaceModalProps) {
  const [isStarted, setIsStarted] = useState(false);
  const { data: nodes = [] } = useListNodeDependentsQuery({
    id: source.id,
    type: source.type,
    dependent_types: DEPENDENT_TYPES,
  });

  return (
    <Modal
      title={getTitle(nodes, isStarted)}
      opened={isOpened}
      onClose={onClose}
    >
      <ReplaceModalBody
        nodes={nodes}
        source={source}
        target={target}
        onStarted={() => setIsStarted(true)}
        onFinished={onFinished}
        onClose={onClose}
      />
    </Modal>
  );
}

type ReplaceModalBodyProps = {
  nodes: DependencyNode[];
  source: ReplaceSourceEntry;
  target: ReplaceSourceEntry;
  onStarted: () => void;
  onFinished: () => void;
  onClose: () => void;
};

const POLLING_INTERVAL = 1000;

function ReplaceModalBody({
  nodes,
  source,
  target,
  onStarted,
  onFinished,
  onClose,
}: ReplaceModalBodyProps) {
  const [runId, setRunId] = useState<ReplaceSourceRunId>();
  const [startTime, setStartTime] = useState(new Date());

  const { data: run } = useGetReplaceSourceRunQuery(runId ?? skipToken, {
    pollingInterval: POLLING_INTERVAL,
  });
  const [replaceSource] = useReplaceSourceMutation();
  const [sendToast] = useToast();

  const handleSubmit = async () => {
    const action = replaceSource({
      source_entity_id: source.id,
      source_entity_type: source.type,
      target_entity_id: target.id,
      target_entity_type: target.type,
    });
    const response = await action.unwrap();
    setRunId(response.run_id);
    setStartTime(new Date());
    onStarted();
  };

  useEffect(() => {
    if (run != null && run.status !== "started") {
      sendToast(getToastMessage(run, nodes));
      onFinished();
    }
  }, [run, nodes, sendToast, onFinished]);

  if (run == null) {
    return (
      <FormProvider initialValues={{}} onSubmit={handleSubmit}>
        <Form>
          <Stack>
            <Text>{t`This can't be undone.`}</Text>
            <Group>
              <Box flex={1}>
                <FormErrorMessage />
              </Box>
              <Button onClick={onClose}>{t`Go back`}</Button>
              <Button type="submit" disabled={runId != null && run == null}>
                {getSubmitLabel(nodes)}
              </Button>
            </Group>
          </Stack>
        </Form>
      </FormProvider>
    );
  }

  return (
    <Stack gap="sm">
      <Text c="text-secondary">{getProgressLabel(startTime)}</Text>
      <Progress value={getProgressValue(run)} />
    </Stack>
  );
}

function getTitle(nodes: DependencyNode[], isStarted: boolean) {
  if (isStarted) {
    return t`Replacing data sources…`;
  }
  return ngettext(
    msgid`Really replace the data source in ${nodes.length} item?`,
    `Really replace the data sources in ${nodes.length} items?`,
    nodes.length,
  );
}

function getSubmitLabel(nodes: DependencyNode[]): string {
  return ngettext(
    msgid`Replace data source in ${nodes.length} item`,
    `Replace data source in ${nodes.length} items`,
    nodes.length,
  );
}

function getProgressValue(run: ReplaceSourceRun): number {
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

type ToastMessageInfo = {
  message: string;
  icon: IconName;
};

function getToastMessage(
  run: ReplaceSourceRun,
  nodes: DependencyNode[],
): ToastMessageInfo {
  if (run.status === "succeeded") {
    return {
      message: ngettext(
        msgid`Updated ${nodes.length} item`,
        `Updated ${nodes.length} items`,
        nodes.length,
      ),
      icon: "check",
    };
  }
  return {
    message: t`Failed to replace data sources`,
    icon: "warning",
  };
}
