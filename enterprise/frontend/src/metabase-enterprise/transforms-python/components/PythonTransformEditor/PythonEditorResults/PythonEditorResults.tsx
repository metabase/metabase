import { useState } from "react";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { LoadingSpinner } from "metabase/common/components/MetadataInfo/MetadataInfo.styled";
import { isMac } from "metabase/lib/browser";
import { Box, Flex, Group, Icon, Stack, Tabs, Text } from "metabase/ui";
import type { TestPythonTransformResponse } from "metabase-types/api";

import { ExecutionOutputTable } from "./ExecutionOutputTable";
import S from "./PythonEditorResults.module.css";

type PythonEditorProps = {
  isRunning?: boolean;
  executionResult: TestPythonTransformResponse;
};

type ResultsTab = "results" | "output";

export function PythonEditorResults({
  executionResult,
  isRunning,
}: PythonEditorProps) {
  const [tab, setTab] = useState<ResultsTab>("results");
  const hasDataOrError = executionResult?.output || executionResult?.error;
  return (
    <DebouncedFrame className={S.visualization}>
      <Stack data-testid="python-results" gap={0} h="100%">
        <ExecutionResultHeader
          executionResult={executionResult}
          tab={tab}
          onTabChange={setTab}
        />
        {!hasDataOrError && <EmptyState />}
        {hasDataOrError &&
          tab === "results" &&
          (executionResult?.error ? (
            <ErrorState error={executionResult.error.message} />
          ) : (
            <ExecutionOutputTable output={executionResult?.output} />
          ))}
        {executionResult && tab === "output" && (
          <ExecutionOutputLogs executionResult={executionResult} />
        )}
        {isRunning && <LoadingState />}
      </Stack>
    </DebouncedFrame>
  );
}

function ExecutionResultHeader({
  executionResult,
  tab,
  onTabChange,
}: {
  executionResult?: TestPythonTransformResponse | null;
  tab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
}) {
  const message = getMessageForExecutionResult(executionResult);

  return (
    <Group className={S.header} justify="space-between">
      <Box mt="xs">
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value) {
              onTabChange(value as ResultsTab);
            }
          }}
        >
          <Tabs.List>
            <Tabs.Tab value="results">{t`Results`}</Tabs.Tab>
            <Tabs.Tab value="output">{t`Output`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>
      {message}
    </Group>
  );
}

function getRunQueryShortcut() {
  return isMac() ? t`⌘ + return` : t`Ctrl + enter`;
}

function LoadingState() {
  return (
    <Flex p="md" className={S.loading}>
      <LoadingSpinner />
    </Flex>
  );
}

function EmptyState() {
  const keyboardShortcut = getRunQueryShortcut();

  return (
    <Flex h="100%" align="center" justify="center">
      <Stack maw="25rem" gap={0} ta="center" align="center">
        <Box maw="3rem" mb="0.75rem">
          <img src={EmptyCodeResult} alt="Code prompt icon" />
        </Box>
        <Text c="text-secondary">
          {c("{0} refers to the keyboard shortcut")
            .jt`To run your code, click on the Run button or type ${(
            <b key="shortcut">({keyboardShortcut})</b>
          )}`}
        </Text>
      </Stack>
    </Flex>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <Stack gap="sm" h="100%" p="md" c="error" className={S.error}>
      <Group fw="bold" gap="sm">
        <Icon name="warning" />
        {t`Error`}
      </Group>
      <Box className={S.traceback} fz="sm">
        {error}
      </Box>
    </Stack>
  );
}

function getMessageForExecutionResult(
  executionResult?: TestPythonTransformResponse | null,
) {
  if (!executionResult) {
    return null;
  }

  if (executionResult.error) {
    return (
      <Flex gap="sm" align="center" pr="md" c="error">
        <Icon name="warning" />
        {t`An error occurred while executing your Python script`}
      </Flex>
    );
  }

  return (
    <Flex gap="sm" align="center" pr="md" c="success">
      <Icon name="check_filled" />
      {t`Script executed successfully`}
    </Flex>
  );
}

function ExecutionOutputLogs({
  executionResult,
}: {
  executionResult: TestPythonTransformResponse | null;
}) {
  return (
    <Box fz="sm" p="md" bg="background-secondary" h="100%" className={S.logs}>
      {executionResult?.logs ? (
        <AnsiLogs>{executionResult.logs}</AnsiLogs>
      ) : (
        <Text
          c="text-tertiary"
          fz="sm"
          fs="italic"
        >{t`No logs to display`}</Text>
      )}
    </Box>
  );
}
