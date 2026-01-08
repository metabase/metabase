import type { ReactNode } from "react";
import { c, t } from "ttag";

import EmptyCodeResult from "assets/img/empty-states/code.svg";
import DebouncedFrame from "metabase/common/components/DebouncedFrame";
import { LoadingSpinner } from "metabase/common/components/MetadataInfo/MetadataInfo.styled";
import { isMac } from "metabase/lib/browser";
import { Box, Flex, Icon, Stack, Text, Title } from "metabase/ui";

import type { ExecutionResult } from "../utils";

import { ExecutionOutputTable } from "./ExecutionOutputTable";
import S from "./PythonEditorResults.module.css";

type PythonEditorProps = {
  isRunning?: boolean;
  executionResult?: ExecutionResult | null;
};

export function PythonEditorResults({
  executionResult,
  isRunning,
}: PythonEditorProps) {
  return (
    <DebouncedFrame className={S.visualization}>
      <ExecutionResultHeader executionResult={executionResult} />
      <ExecutionResults executionResult={executionResult} />
      {isRunning && <LoadingState />}
    </DebouncedFrame>
  );
}

function ExecutionResultHeader({
  executionResult,
}: {
  executionResult?: ExecutionResult | null;
}) {
  const message = getMessageForExecutionResult(executionResult);
  return <Flex w="100%">{message}</Flex>;
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
    <Flex h="100%" align="center" justify="center" className={S.empty}>
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

function ExecutionResults({
  executionResult,
}: {
  executionResult?: ExecutionResult | null;
}) {
  if (!executionResult) {
    return <EmptyState />;
  }

  return (
    <Stack gap={0}>
      <ExecutionLogs
        label={t`Standard output:`}
        content={executionResult.stdout}
      />
      <ExecutionLogs
        label={t`Standard error:`}
        content={executionResult.stderr}
      />

      <ExecutionOutputTable output={executionResult.output} />
    </Stack>
  );
}

function getMessageForExecutionResult(
  executionResult?: ExecutionResult | null,
) {
  if (!executionResult) {
    return null;
  }
  if (executionResult.error) {
    return (
      <Box className={S.error} p="sm" w="100%">
        <Flex gap="sm">
          <Icon name="warning" />
          <Stack gap={0}>
            <Title order={5} mb="xs">
              {t`An error occurred while executing your Python script`}
            </Title>
            {executionResult.error}
          </Stack>
        </Flex>
      </Box>
    );
  }

  if (!executionResult.output) {
    return (
      <Flex className={S.info} p="sm" gap="sm" align="center" w="100%">
        <Icon name="info" />
        {t`No results to display.`}
      </Flex>
    );
  }

  return (
    <Flex className={S.success} p="sm" gap="sm" align="center" w="100%">
      <Icon name="check" />
      {t`Script executed successfully.`}
    </Flex>
  );
}

function ExecutionLogs({
  label,
  content,
}: {
  label: string;
  content?: string | null;
}) {
  if (!content) {
    return null;
  }

  return (
    <Section title={label}>
      <Box
        p="sm"
        bg="background-secondary"
        mah="150px"
        bdrs="xs"
        className={S.logs}
      >
        {content}
      </Box>
    </Section>
  );
}

function Section({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      {title && (
        <Title order={5} mb="xs">
          {title}
        </Title>
      )}
      {children}
    </Box>
  );
}
