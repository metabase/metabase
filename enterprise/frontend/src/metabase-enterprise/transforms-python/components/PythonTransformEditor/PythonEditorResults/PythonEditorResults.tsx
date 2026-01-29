import { useEffect, useState } from "react";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import { AnsiLogs } from "metabase/common/components/AnsiLogs";
import { DebouncedFrame } from "metabase/common/components/DebouncedFrame";
import { LoadingSpinner } from "metabase/common/components/MetadataInfo/MetadataInfo.styled";
import { isMac } from "metabase/lib/browser";
import {
  ActionIcon,
  Box,
  Flex,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
} from "metabase/ui";
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
  const [footerDismissed, setFooterDismissed] = useState(false);
  const hasDataOrError = executionResult?.output || executionResult?.error;

  useEffect(() => {
    setFooterDismissed(false);
  }, [executionResult]);

  return (
    <DebouncedFrame className={S.visualization}>
      <Stack data-testid="python-results" gap={0} h="100%">
        <ExecutionResultTabs tab={tab} onTabChange={setTab} />
        <Box className={S.content} flex={1} mih={0}>
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
        </Box>
        {!footerDismissed && (
          <ResultsFooter
            executionResult={executionResult}
            onDismiss={() => setFooterDismissed(true)}
          />
        )}
        {isRunning && <LoadingState />}
      </Stack>
    </DebouncedFrame>
  );
}

function ExecutionResultTabs({
  tab,
  onTabChange,
}: {
  tab: ResultsTab;
  onTabChange: (tab: ResultsTab) => void;
}) {
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
            <Tabs.Tab value="results">{t`Results preview`}</Tabs.Tab>
            <Tabs.Tab value="output">{t`Output`}</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Box>
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

function ResultsFooter({
  executionResult,
  onDismiss,
}: {
  executionResult?: TestPythonTransformResponse | null;
  onDismiss: () => void;
}) {
  if (!executionResult) {
    return null;
  }

  if (executionResult.error) {
    return (
      <Flex className={S.footer} gap="xs" align="center" px="md" py="md">
        <Icon size="1rem" style={{ flexShrink: 0 }} name="warning" c="error" />
        <Text
          c="text-primary"
          ml="xs"
        >{t`An error occurred while executing your Python script.`}</Text>
        <DismissButton onDismiss={onDismiss} />
      </Flex>
    );
  }

  if (!executionResult.output) {
    return null;
  }

  return (
    <Flex className={S.footer} gap="xs" align="center" px="md" py="md">
      <Icon
        size="1rem"
        style={{ flexShrink: 0 }}
        name="check_filled"
        c="success"
      />
      <Text fw="bold" c="text-primary" lh="xs">{t`Done`}</Text>
      <Text
        c="text-tertiary"
        ml="xs"
        lh="xs"
      >{t`Preview based on the first 100 rows from each table.`}</Text>
      <DismissButton onDismiss={onDismiss} />
    </Flex>
  );
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <ActionIcon
      ml="auto"
      size="1.5rem"
      radius="xl"
      variant="subtle"
      c="text-tertiary"
      onClick={onDismiss}
      aria-label={t`Dismiss`}
    >
      <Icon name="close" size={12} />
    </ActionIcon>
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
